const { templateTextCompAdvanced, templateTextModAdvanced } = require('./prompts');
const { getContext, getDiagnostics, getLanguageID } = require('./utils');
const { ChatCompletionMessage } = require('./interfaces');

export function generatePayload(userCommand: string, isEmpty: boolean) {
    const language = getLanguageID();
    const context = getContext();
    const diagnostics = getDiagnostics();

    let messageList = new Array<typeof ChatCompletionMessage>();

    if (isEmpty) {
        messageList.push({
            role: 'user',
            content: templateTextCompAdvanced
        });

    }
    else {
        messageList.push({
            role: 'user',
            content: templateTextModAdvanced
        });
    }

    if (userCommand.length > 0) {
        messageList.push({
            role: 'user',
            content: `
                language: "${language}"
                context_before_selection: "${context[0]}"
                selected_text: "${context[1]}"
                context_after_selection: "${context[2]}"
                user_request: "Only return the text that replaces selected text. \nHere's the request: ${userCommand}"`
        });
    }
    else {
        messageList.push({
            role: 'user',
            content: `
                language: "${language}"
                context_before_selection: "${context[0]}"
                selected_text: "${context[1]}"
                context_after_selection: "${context[2]}"
                user_request: "Complete the code or text"`
        });
    }
    return messageList;
}