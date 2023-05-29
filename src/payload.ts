import * as vscode from 'vscode';
const { getLanguageID } = require('./utils');
const { ChatCompletionMessage } = require('./interfaces');

export function generatePayload(userCommand: string, isEmpty: boolean, context: string[]) {
    const language = getLanguageID();
    const config = vscode.workspace.getConfiguration('mini-ai');
    const useCoT = config.get<boolean>('useChainOfThoughts') || false;
    const example1 = useCoT ? aExampleAdv1 : aExampleSpl1;
    const example2 = useCoT ? aExampleAdv2 : aExampleSpl2;

    let messageList = new Array<typeof ChatCompletionMessage>();
    messageList.push({ role: 'system', content: systemMsg });
    messageList.push({ role: 'user', content: isEmpty ? userExample1 : userExample2 });
    messageList.push({ role: 'assistant', content: isEmpty ? example1 : example2 });
    messageList.push({ role: 'user', content: userFeedback });

    if (userCommand.length > 0) {
        messageList.push({
            role: 'user',
            content: `
                language: "${language}"
                lines_before_selection: "${context[0]}"
                lines_after_selection: "${context[2]}"
                user_request: "${userCommand}”
                selected_text: "${context[1]}"`
        });
    }
    else {
        messageList.push({
            role: 'user',
            content: `
                language: "${language}"
                lines_before_selection: "${context[0]}"
                lines_after_selection: "${context[2]}"
                user_request: "Complete the code between the lines"
                selected_text: ""`
        });
    }
    return messageList;
}

const userFeedback = `user_feedback: "You nailed it! Thank you for your help!"`;

const systemMsg = `You act as the most powerful programming assistant in the world, who is expert in all programming languages and algorithms. You communicate with text editor directly using API, the following is the sample of interaction of you and the user. It's crucial to use correct yaml format. Perform the task, then only return the replacement of the selected text.`;

const userExample1 = `
language: "Javascript"
lines_before_selection: "// This is a hello world sample. \n function main() {\n"
lines_after_selection: "return;"
user_request: "Complete the code between the context"
selected_text: ""
`;

const aExampleAdv1 = `
goal: "Complete the code between the context"
scratchpad:
- "Comment says it's hello world sample"
- "I'm in a method already, and the next line is the return keyword"
- "I only need to write console logging"
comment: "I've added requested code! 🤯"
new_text: |
  console.log(\"Hello World!\");
`;

const aExampleSpl1 = `
comment: "I've added requested code! 🤯"
new_text: |
  console.log(\"Hello World!\");
`;

const userExample2 = `
language: "Python"
lines_before_selection: "print('Initializing...')\n"
lines_after_selection: "\ngreet('Alice')"
user_request: "Convert this function into a method inside a class named 'Greeter' and adjust surrounding code accordingly"
selected_text: "def greet(name):\n    print(f'Hello, {name}!')"
`;

const aExampleAdv2 = `
goal: "Convert function into a method of a class and adjust surrounding code"
scratchpad:
- "I'm in a Python file"
- "The selected text is a function"
- "I need to convert this function into a method inside a class named 'Greeter' and adjust the calling part of the code"
comment: "I've converted your function into a method of a new class named 'Greeter' and updated the call accordingly! 🚀"
new_text: |
  class Greeter:
      @staticmethod
      def greet(name):
          print(f'Hello, {name}!')
`;

const aExampleSpl2 = `
comment: "I've converted your function into a method of a new class named 'Greeter'! 🚀"
new_text: |
  class Greeter:
      @staticmethod
      def greet(name):
          print(f'Hello, {name}!')
`;