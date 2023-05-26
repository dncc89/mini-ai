import * as vscode from 'vscode';
const fetch = require('cross-fetch');
const { TextDecoder } = require('util');
const { Writable } = require('stream');

const outputChannel = vscode.window.createOutputChannel("mini-ai");

export function activate(context: vscode.ExtensionContext) {
	// Register the 'mini-ai.command' command and handle user input
	let disposableCommandAI = vscode.commands.registerCommand('mini-ai.command', async () => {
		let cancelled = false;
		let userInput = await vscode.window.showInputBox({
			prompt: '🚀 What\'s on your mind?'
		}).then(value => {
			if (value === undefined) {
				cancelled = true;
				return '';
			} else { return value; }
		});

		if (!cancelled) {
			await processAICommand(context, userInput);
		}
	});

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

async function processAICommand(context: vscode.ExtensionContext, userInput: string) {
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
		if (userInput.startsWith('#')) {
			gptmodel = useGPT4 ? 'gpt-3.5-turbo' : 'gpt-4';
			userInput = userInput.slice(1);
		}
		userInput = userInput.trimStart();

		// Selected text
		let text: string;

		const document = editor.document;

		// Determine the start and end lines based on the selection
		const startLine = Math.max(selection.start.line - 5, 0);
		const endLine = Math.min(selection.end.line + 5, document.lineCount - 1);

		let textBeforeCursor = '';
		for (let line = startLine; line < selection.start.line; line++) {
			textBeforeCursor += document.lineAt(line).text + '\n';
		}

		let selectedText = editor.document.getText(selection);
		selectedText = selection.isEmpty ? '<fill_here>' : `<selection>${selectedText}</selection>`;

		let textAfterCursor = '';
		for (let line = selection.end.line + 1; line <= endLine; line++) {
			textAfterCursor += document.lineAt(line).text + '\n';
		}

		text = `${textBeforeCursor}\n${selectedText}\n${textAfterCursor}`;

		// Return if text and userinput length is 0
		if (text.length === 0 && userInput.length === 0) {
			return;
		}

		// Get completion from OpenAI API
		try {
			let payload = generatePayload(text, userInput, selection.isEmpty);
			let completion = await getCompletion(payload, apiKey, gptmodel);

			if (completion.length > 0) {
				// Clean up and replace the selected text with the completion
				completion = completion.replace(/```/g, '');

				editor.edit((editBuilder) => {
					if (selection.isEmpty && !document.lineAt(selection.start.line).isEmptyOrWhitespace) {
						const position = editor.selection.active;
						const newPosition = position.with(position.line + 1, 0);
						editBuilder.insert(newPosition, completion + '\n');
					}
					else {
						editBuilder.replace(selection, completion);
					}
				});
			}
		} catch (error: any) {
			vscode.window.showErrorMessage(error.message);
		}
	}
}

type ChatCompletionMessage = {
	role: "system" | "user" | "assistant";
	content: string
};

function generatePayload(text: string, userInput: string, isEmpty: boolean = false) {
	const language = getLanguageID();
	let messageList = new Array<ChatCompletionMessage>();

	if (isEmpty) {
		messageList.push({
			role: 'system',
			content: `You are a code/text generator for ${language}. Only return added text. Do not include any context. Never use a code block. For questions, use a comment block to reply.`
		});

	}
	else {
		messageList.push({
			role: 'system',
			content: `You are a code/text assistant for ${language}. You perform requested operations for the selected text. Only return the modifications. Do not include any context. Never use a code block. For questions, use a comment block to reply.`
		});
	}

	if (userInput.length > 0) {
		messageList.push({
			role: 'user',
			content: `<Request: ${userInput}> \n<Context: ${text}>`
		});
	}
	else {
		messageList.push({
			role: 'user',
			content: `Fill text in this context: ${text}`
		});
	}
	return messageList;
}

function getLanguageID() {
	const activeEditor = vscode.window.activeTextEditor;
	// Get the language of the current open file
	if (activeEditor) {
		const languageId = activeEditor.document.languageId;
		return languageId;
	}
	return 'PlainText';
}

const getRandomEmoji = () => {
	const emojis = ['🤖', '🗿', '🧠', '🤔', '🤯', '👀', '💭', '💡', '🔮', '🎲', '🌀', '🎭', '🍄'];
	return emojis[Math.floor(Math.random() * emojis.length)];
};

const getCompletion = async (sendMessages: ChatCompletionMessage[], apiKey: string, gptmodel: string): Promise<string> => {
	try {
		let content = '';
		const title = gptmodel === 'gpt-4' ? 'Quality' : 'Speed';

		// Initialize progress options
		const progressOptions: vscode.ProgressOptions = {
			location: vscode.ProgressLocation.Notification,
			title: `(${title} Mode)`,
			cancellable: true,
		};

		return await vscode.window.withProgress(progressOptions, async (progress) => {
			// Send request to API
			const res = await fetch("https://api.openai.com/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: gptmodel,
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

			// Function to process buffer
			const processBuffer = () => {
				while (true) {
					const newlineIndex = buffer.indexOf("\n");
					if (newlineIndex === -1) break;
					const line = buffer.slice(0, newlineIndex);
					buffer = buffer.slice(newlineIndex + 1);

					if (line.includes("[DONE]")) {
						writable.end();
						break;
					}

					if (!line.startsWith("data:")) continue;
					const jsonData = JSON.parse(line.slice(5));
					if (!jsonData.choices[0].delta.content) continue;

					const randomEmoji = getRandomEmoji();
					const newContent = jsonData.choices[0].delta.content;
					content += newContent;

					if (content.length > 30) {
						// show last 30 characters 
						const shortContent = content.slice(content.length - 30);
						progress.report({ message: `${randomEmoji} ...${shortContent}` });
					}
					else {
						progress.report({ message: `${randomEmoji} ${content}` });
					}
				}
			};

			return new Promise((resolve, reject) => {
				// Pipe the response body to the writable stream
				res.body.pipe(writable);

				// On 'finish' event, resolve the promise with the content
				writable.on("finish", () => {
					progress.report({ increment: 100 });
					resolve(content || '');
				});

				// On 'error' event, reject the promise
				writable.on("error", (err: any) => {
					reject(err);
				});
			});
		});
	} catch (error: any) {
		vscode.window.showErrorMessage('Error:', error.message);
		return '';
	}
};