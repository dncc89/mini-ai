# mini-ai

![Alt text](public/miniai.gif?raw=true "Demo")

A minimalist code assistant powered by GPT, inspired by [ai.vim](https://github.com/aduros/ai.vim). mini-ai provides a seamless interface for AI-powered text modification and completion, enhancing your coding experience.

Check out the [mini-ai GitHub repository](https://github.com/dncc89/mini-ai) for more details and updates.

## Features

1. **Modifying Selected Text by Instruction:** Just select the text you want to modify and type your instruction. mini-ai will adjust the selected text accordingly.

2. **Text Completion by Understanding the Context:** With mini-ai, you don't have to worry about completing complex lines of code. Simply place your cursor where you want the completion and let mini-ai take care of the rest.

# How to Use
Using mini-ai is simple. Open the command palette and search for the `mini-ai: Ask` command.

mini-ai supports both GPT-3.5 Turbo and GPT-4. You can easily switch between the two versions by adding '#' to the prompt for GPT-4. If there's no prompt, mini-ai will default to auto-completion at the cursor's position. 

**Please note that the use of GPT-4 requires access permission.**

### To use GPT-3.5 Turbo
Select text and just enter your prompt directly.
```
mini-ai.ask: Replace all tabs with spaces in the selected text.
```
### To use GPT-4
Add '#' to the beginning of your command. Please note that the use of GPT-4 requires access permission.
```
mini-ai.ask: # Replace all tabs with spaces in the selected text.
```
### For Text Completion
Simply place your cursor where you need it and activate the mini-ai.ask command without inputting anything in the prompt. You can trigger GPT-4 by adding '#' to the beginning of your command.
```
def greet(name):
    return "Hello, "  # Place cursor here and run mini-ai.ask

Result:
def greet(name):
    return "Hello, " + name 
```

---

 You can also bind the `mini-ai.ask` to a shortcut key for quick access. Here is an example for vscodevim keymapping:

```json
{
    // Replace <your preferred shortcut> with your chosen keybinding.
    "vim.normalModeKeyBindingsNonRecursive": [
        {
            "before": ["<your preferred shortcut>"],
            "commands": ["mini-ai.ask"]
        }
    ],
    "vim.visualModeKeyBindingsNonRecursive": [
        {
            "before": ["<your preferred shortcut>"],
            "commands": ["mini-ai.ask"]
        }
    ],
    "vim.insertModeKeyBindingsNonRecursive": [
        {
            "before": ["<your preferred shortcut>"],
            "commands": ["mini-ai.ask"]
        }
    ]
}

```

--- 

Enjoy coding & writing with mini-ai! 🚀