import * as vscode from 'vscode';
const fetch = require('cross-fetch');
const { TextDecoder } = require('util');
const { Writable } = require('stream');


export function activate(context: vscode.ExtensionContext) {
	let disposableAskAI = vscode.commands.registerCommand('minigpt.askAI', async () => {
		let userInput = await vscode.window.showInputBox({
			title: 'MiniGPT: What do you want to do?',
			prompt: 'Start with # to use GPT-4.'
		}) || '';
		await processAICommand(context, userInput);
	});

	let disposableSetKey = vscode.commands.registerCommand('minigpt.setAPIKey', async () => {
		let apiKey = await vscode.window.showInputBox({ prompt: 'Enter OpenAI API Key' });

		if (apiKey) {
			context.globalState.update('openAIKey', apiKey);
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
		let document = editor.document;
		let selection = editor.selection;
		let gptmodel = 'gpt-3.5-turbo';

		// If userinput starts with #, use gpt-3.5-turbo model
		if (userInput.startsWith('#')) {
			gptmodel = 'gpt-4';
			userInput = userInput.slice(1);
		}

		// Selected text
		let text: string;

		// Check if there's a selection, if not, take the text block around the cursor
		if (selection.isEmpty) {
			text = getTextBlock(document, editor.selection.active);
		} else {
			text = document.getText(selection);
		}

		// Return if text and userinput length is 0
		if (text.length === 0 && userInput.length === 0) {
			return;
		}

		// Mark where the cursor is
		let cursorOffset = editor.document.offsetAt(editor.selection.active);
		let selectionStartOffset = editor.document.offsetAt(new vscode.Position(selection.start.line, 0));
		let cursorPositionInSelection = cursorOffset - selectionStartOffset;
		text = text.slice(0, cursorPositionInSelection) + '{Your text goes here}' + text.slice(cursorPositionInSelection);

		// Ensure API key exists
		const openAIKey = context.globalState.get<string>('openAIKey');
		if (!openAIKey) {
			vscode.window.showErrorMessage('No OpenAI API Key found. Please set it using "Set API Key" command.');
			return;
		}

		try {
			// Generate payload and make a request
			let payload = generatePayload(text, userInput, !selection.isEmpty);
			let completion = await getChatCompletionStreaming(payload, openAIKey, gptmodel);

			if (completion.length > 0) {
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
}

function generatePayload(text: string, userInput: string, isFill: boolean = false) {
	let messageList = new Array<ChatCompletionMessage>();

	if (isFill) {
		messageList.push({
			role: 'system',
			content: `You are a code assistant. Do not write any comment or explanation, only return the text where user requested to fill. Never use a code block. ${userInput}`
		});
	}
	else {
		messageList.push({
			role: 'system',
			content: `You are a code assistant. Do not write any comment or explanation, only return the requested modification of code or text. Never use a code block. ${userInput}`
		});
	}

	messageList.push({ role: 'user', content: text });

	return messageList;
}

function getTextBlock(document: vscode.TextDocument, position: vscode.Position): string {
	return document.lineAt(position.line).text;
}


const getChatCompletionStreaming = async (sendMessages: ChatCompletionMessage[], apiKey: string, gptmodel: string): Promise<string> => {
	try {
		let content = ''
		const title = gptmodel === 'gpt-4' ? 'GPT-4' : 'GPT-3.5 Turbo'

		// Initialize progress options
		const progressOptions: vscode.ProgressOptions = {
			location: vscode.ProgressLocation.Notification,
			title: `(${title}) Thinking`,
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

					if (!line.startsWith("data:")) continue;
					const jsonData = JSON.parse(line.slice(5));
					if (!jsonData.choices[0].delta.content) continue;

					const newContent = jsonData.choices[0].delta.content;
					content += newContent;

					if (content.length > 30) {
						// show last 30 characters 
						const shortContent = content.slice(content.length - 30);
						progress.report({ message: `"...${shortContent}"` });
					}
					else {
						progress.report({ message: `"${content}"` });
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