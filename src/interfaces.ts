export type ChatCompletionMessage = {
    role: "system" | "user" | "assistant";
    content: string
};

export type YamlResponse = {
    goal: string;
    scratchpad: string[];
    comment: string;
    new_text: string;
};

