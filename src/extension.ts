import * as vscode from 'vscode';
const fetch = require('cross-fetch');
const { TextDecoder } = require('util');
const { Writable } = require('stream');

export function activate(context: vscode.ExtensionContext) {
	let disposableAskAI = vscode.commands.registerCommand('mini-ai.ask', async () => {
		let cancelled = false;
		let userInput = await vscode.window.showInputBox({
			prompt: '🚀 What\'s on your mind?'
		}).then(value => {
			if (value === undefined) {
				cancelled = true;
				return '';
			}
			else {
				return value;
			}
		});

		if (!cancelled) {
			await processAICommand(context, userInput);
		}
	});

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

	context.subscriptions.push(disposableAskAI);
	context.subscriptions.push(disposableSetKey);
}

export function deactivate() { }

async function processAICommand(context: vscode.ExtensionContext, userInput: string) {
	const editor = vscode.window.activeTextEditor;

	if (editor) {
		const document = editor.document;
		const selection = editor.selection;
		const config = vscode.workspace.getConfiguration('mini-ai');
		const useGPT4 = config.get<boolean>('useGPT4') || false;
		let gptmodel = useGPT4 ? 'gpt-4' : 'gpt-3.5-turbo';

		// If userinput starts with #, flip the model 
		if (userInput.startsWith('#')) {
			gptmodel = useGPT4 ? 'gpt-3.5-turbo' : 'gpt-4';
			userInput = userInput.slice(1);
		}
		userInput = userInput.trimStart();

		// Selected text
		let text: string;

		if (!selection.isEmpty) {
			// Retrieve selected text
			text = editor.document.getText(selection);
		} else {
			// Retrieve text before and after the cursor
			// Retrieve lines before and after the cursor
			const cursorPosition = editor.selection.active;
			const document = editor.document;

			const startLine = Math.max(cursorPosition.line - 5, 0);
			const endLine = Math.min(cursorPosition.line + 5, document.lineCount - 1);

			let textBeforeCursor = '';
			for (let line = startLine; line < cursorPosition.line; line++) {
				textBeforeCursor += document.lineAt(line).text + '\n';
			}

			let textAfterCursor = '';
			for (let line = cursorPosition.line + 1; line <= endLine; line++) {
				textAfterCursor += document.lineAt(line).text + '\n';
			}
			const cursorMarker = '<fill here>';
			text = `${textBeforeCursor}\n${cursorMarker}\n${textAfterCursor}`;
		}

		// Return if text and userinput length is 0
		if (text.length === 0 && userInput.length === 0) {
			return;
		}

		// Ensure API key exists
		const apiKey = await context.secrets.get('openAIKey');
		if (!apiKey) {
			vscode.window.showErrorMessage('No OpenAI API Key found. Please set it using "Set API Key" command.');
			return;
		}

		try {
			// Generate payload and make a request
			let payload = generatePayload(text, userInput, selection.isEmpty);
			let completion = await getCompletion(payload, apiKey, gptmodel);

			if (completion.length > 0) {
				// Clean up if completion is wrapped in code box
				completion = completion.replace(/```/g, '');
				// Replace the selected text with the completion
				editor.edit((editBuilder) => {
					editBuilder.replace(selection, completion);
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
			content: `You are a code/text generator for ${language}. Only return added text. No context needed. Never use a code block.`
		});

	}
	else {
		messageList.push({
			role: 'system',
			content: `You are a code/text generator for ${language}. Only return the requested modification. No context needed. Never use a code block.`
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

const getCompletion = async (sendMessages: ChatCompletionMessage[], apiKey: string, gptmodel: string): Promise<string> => {
	try {
		let content = '';
		const title = gptmodel === 'gpt-4' ? 'Quality' : 'Speed';

		// Initialize progress options
		const progressOptions: vscode.ProgressOptions = {
			location: vscode.ProgressLocation.Notification,
			title: `(${title} Mode)`,
			cancellable: false,
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
					// List of emojis, robot, brain, and thinking face
					const emojis = ['🤖', '🗿', '🧠', '🤔', '🤯', '👀', '💭', '💡', '🔮', '🎲', '🌀', '🎭', '🍄'];

					// Pick random emoji
					const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

					if (!line.startsWith("data:")) continue;
					const jsonData = JSON.parse(line.slice(5));
					if (!jsonData.choices[0].delta.content) continue;

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