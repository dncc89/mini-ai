import * as vscode from 'vscode';
import * as yaml from 'yaml';
// import * as yaml from 'js-yaml';
import { YamlResponse } from './interfaces';

const { getContext, getRandomEmoji } = require('./utils');
const { ChatCompletionMessage, YamlResponse } = require('./interfaces');
const { generatePayload } = require('./payload');
const { TextDecoder } = require('util');
const { Writable } = require('stream');
const fetch = require('cross-fetch');

export function activate(context: vscode.ExtensionContext) {
	// Register the 'mini-ai.command' command and handle user input
	let disposableCommandAI = vscode.commands.registerCommand('mini-ai.command', async () => {
		let cancelled = false;
		let userCommand = await vscode.window.showInputBox({
			prompt: '🚀 What\'s on your mind?'
		}).then(value => {
			if (value === undefined) {
				cancelled = true;
				return '';
			} else { return value; }
		});

		if (!cancelled) {
			await processAICommand(context, userCommand);
		}
	});

	// Register the 'mini-ai.commandFromTemplates' command and handle user input
	let disposableCommandFromTemplates = vscode.commands.registerCommand('mini-ai.commandFromTemplates', async () => {
		const config = vscode.workspace.getConfiguration('mini-ai');
		let templates: string[] = config.get('templates', []);

		let quickPickItems: vscode.QuickPickItem[] = templates.map(template => ({ label: template }));

		// Add templates with '#' prefix
		let hashtagTemplates: vscode.QuickPickItem[] = templates.map(template => ({ label: '# ' + template }));
		quickPickItems = quickPickItems.concat(hashtagTemplates);

		// Add an extra item to represent the "Add new template" action
		quickPickItems.push({ label: '+ Add new template' });

		let selectedTemplate = await vscode.window.showQuickPick(quickPickItems, {
			placeHolder: '🚀 Select a template or add a new one',
		});

		if (selectedTemplate) {
			if (selectedTemplate.label === '+ Add new template') {
				// If the user selected the "Add new template" action, open a new input box
				let newTemplate = await vscode.window.showInputBox({
					prompt: 'Enter the new template',
				});
				if (newTemplate) {
					// If the user entered a new template, add it to the settings
					templates.push(newTemplate);
					await config.update('templates', templates, vscode.ConfigurationTarget.Global);
					vscode.window.showInformationMessage('Template added successfully');
				}
			} else {
				// If the user selected a template, process it
				vscode.window.showInformationMessage(`Selected template: ${selectedTemplate.label}`);
				await processAICommand(context, selectedTemplate.label);
			}
		}
	});

	// Process AI command if not cancelled, and handle secret storage and API key input
	const secretStorage: vscode.SecretStorage = context.secrets;
	let disposableSetKey = vscode.commands.registerCommand('mini-ai.setkey', async () => {
		let apiKey = await vscode.window.showInputBox({
			prompt: 'Enter OpenAI API Key',
			password: true
		});

		if (apiKey) {
			secretStorage.store("openAIKey", apiKey);
			vscode.window.showInformationMessage('API Key set successfully');
		}
	});

	context.subscriptions.push(disposableCommandAI);
	context.subscriptions.push(disposableCommandFromTemplates);
	context.subscriptions.push(disposableSetKey);
}

export function deactivate() { }

async function processAICommand(context: vscode.ExtensionContext, userCommand: string) {
	// Ensure API key exists
	const apiKey = await context.secrets.get('openAIKey');
	if (!apiKey) {
		vscode.window.showErrorMessage('No OpenAI API Key found. Please set it using "Set API Key" command.');
		return;
	}

	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const selection = editor.selection;
		const config = vscode.workspace.getConfiguration('mini-ai');

		// Get the user's configuration preference for using GPT-4 or the default GPT-3.5-turbo model
		// If the user input starts with '#', toggle between GPT-4 and GPT-3.5-turbo and update the input accordingly
		const useGPT4 = config.get<boolean>('useGPT4') || false;
		let gptmodel = useGPT4 ? 'gpt-4' : 'gpt-3.5-turbo';
		if (userCommand.startsWith('#')) {
			gptmodel = useGPT4 ? 'gpt-3.5-turbo' : 'gpt-4';
			userCommand = userCommand.slice(1);
		}
		userCommand = userCommand.trimStart();
		const context = getContext();

		// Generate payload
		let payload = await generatePayload(userCommand, selection.isEmpty, context);

		// Get completion from OpenAI API
		let completion = await getCompletion(payload, apiKey, gptmodel);

		// Parse and output result
		processCompletion(completion, context);
	}
}

function processCompletion(completion: string, context: string[]) {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const selection = editor.selection;

		// remove ```yaml in case GPT3.5 messes up 
		completion = completion.replace('\`\`\`yaml', '');
		completion = completion.replace('\`\`\`', '');
		completion = completion.replace('```yaml', '');
		completion = completion.replace('```', '');

		if (completion.length === 0) {
			return;
		}

		try {
			const yamlObj = yaml.parse(completion, { prettyErrors: true, strict: false }) as YamlResponse;
			// const yamlObj = yaml.load(completion) as YamlResponse;
			if (!yamlObj.result_output) {
				yamlObj.result_output = "";
			}
			else {
				// force remove context from result_output
				yamlObj.result_output = yamlObj.result_output.replace(context[0], '');
				yamlObj.result_output = yamlObj.result_output.replace(context[2], '');
			}

			if (yamlObj.comment) {
				vscode.window.showInformationMessage(`mini-ai: ${yamlObj.comment}`);
			}

			if (yamlObj.result_output) {
				editor.edit((editBuilder) => {
					editBuilder.replace(selection, yamlObj.result_output);
				});
			}
		}
		catch (error: any) {
			vscode.window.showErrorMessage(`mini-ai: ${error.message} \n ${completion}}`);
		}
	}
}

const getCompletion = async (sendMessages: typeof ChatCompletionMessage[], apiKey: string, gptmodel: string): Promise<string> => {
	try {
		let content = '';
		const title = gptmodel === 'gpt-4' ? 'Quality' : 'Speed';

		// Initialize progress options
		const progressOptions: vscode.ProgressOptions = {
			location: vscode.ProgressLocation.Notification,
			title: `mini-ai`,
			cancellable: true,
		};

		return await vscode.window.withProgress(progressOptions, async (progress, token) => {
			// Send request to API
			const res = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: gptmodel,
					temperature: 0.0,
					top_p: 0,
					frequency_penalty: 0,
					stream: true,
					messages: sendMessages,
				}),
			});

			if (!res.ok || !res.body) throw new Error();

			let buffer = "";
			const textDecoder = new TextDecoder();

			// Create a writable stream that processes data in chunks
			const writable = new Writable({
				write(chunk: any, encoding: any, callback: any) {
					buffer += textDecoder.decode(chunk, { stream: true });
					processBuffer();
					callback();
				}
			});

			const processBuffer = () => {
				while (true) {
					const newlineIndex = buffer.indexOf("\n");
					if (newlineIndex === -1) break;
					const line = buffer.slice(0, newlineIndex);
					buffer = buffer.slice(newlineIndex + 1);

					if (line.includes("[DONE]") || token.isCancellationRequested) {
						writable.end();
						break;
					}

					if (!line.startsWith("data:")) continue;
					const jsonData = JSON.parse(line.slice(5));
					if (!jsonData.choices[0].delta.content) continue;

					const randomEmoji = getRandomEmoji();
					const newContent = jsonData.choices[0].delta.content;
					content += newContent;
					progress.report({ increment: 0.5, message: `(${title} Mode) Thinking... ${randomEmoji}` });
				}
			};

			return new Promise((resolve, reject) => {
				// Pipe the response body to the writable stream
				res.body.pipe(writable);

				// On 'finish' event, resolve the promise with the content
				writable.on("finish", () => {
					if (token.isCancellationRequested) {
						progress.report({ increment: 100 });
						resolve('');
					}
					else {
						resolve(content || '');
					}
				});

				// On 'error' event, reject the promise
				writable.on("error", (err: any) => {
					reject(err);
				});
			});
		});
	} catch (error: any) {
		vscode.window.showErrorMessage('mini-ai error:', error.message);
		return '';
	}
};