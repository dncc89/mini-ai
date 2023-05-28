# Change Log

## [0.0.6]
- Added a toggle for chain of thoughts.
- Modified prompts clearer.

## [0.0.5]
- Hotfix for GPT3.5 returning the entire context instead of selected text.

## [0.0.4]

- Updated prompting - Now it's based on few-shot prompting with a chain-of-thoughts approach. Also it understands the context better. This makes GPT-3.5 Turbo perform tasks more accurately and improves communication between the API and the extension, resulting in fewer failures.
- Message from AI is now displayed as notification.
- Added context length setting

## [0.0.3]

- `mini-ai: Ask` is now `mini-ai: Command`
The shift from `Ask` to `Command` implies a more active, direct interaction, as users give specific commands instead of passively asking.

- Introducing prompt template!
You can call saved prompts like quicksilver with the `mini-ai.commandFromTemplates` command.

- Selected text modification now concerns the context around the selection.

## [0.0.2] 

- Model switching issue was addressed.

## [0.0.1]

- Initial release 🎉🥳