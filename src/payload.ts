import * as vscode from 'vscode';
const { templateTextCompAdvanced, templateTextModAdvanced, templateTextCompSimple, templateTextModSimple } = require('./prompts');
const { getDiagnostics, getLanguageID } = require('./utils');
const { ChatCompletionMessage } = require('./interfaces');

export function generatePayload(userCommand: string, isEmpty: boolean, context: string[]) {
    const language = getLanguageID();
    const diagnostics = getDiagnostics();
    const config = vscode.workspace.getConfiguration('mini-ai');
    const useCoT = config.get<boolean>('useChainOfThoughts') || false;

    let messageList = new Array<typeof ChatCompletionMessage>();

    if (isEmpty) {
        messageList.push({
            role: 'user',
            content: useCoT ? templateTextCompAdvanced : templateTextCompSimple
        });

    }
    else {
        messageList.push({
            role: 'user',
            content: useCoT ? templateTextModAdvanced : templateTextModSimple
        });
    }

    if (userCommand.length > 0) {
        messageList.push({
            role: 'user',
            content: `
                language: "${language}"
                context_before_selection: "${context[0]}"
                context_after_selection: "${context[2]}"
                selected_text: "${context[1]}"
                user_request: "Return the replacement of selected text. \nRequest: ${userCommand}"`
        });
    }
    else {
        messageList.push({
            role: 'user',
            content: `
                language: "${language}"
                context_before: "${context[0]}"
                context_after: "${context[2]}"
                selected_text: "${context[1]}"
                user_request: "Complete the code or text"`
        });
    }
    return messageList;
}