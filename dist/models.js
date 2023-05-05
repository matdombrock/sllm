"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.modelAlias = exports.modelMap = void 0;
exports.modelMap = {
    'text-davinci-002': {
        model: 'text-davinci-002',
        api: 'davinci',
        maxTokens: 4097,
        beta: false
    },
    'text-davinci-003': {
        model: 'text-davinci-003',
        api: 'davinci',
        maxTokens: 4097,
        beta: false
    },
    'gpt-3.5-turbo': {
        model: 'gpt-3.5-turbo',
        api: 'gpt',
        maxTokens: 4096,
        beta: false
    },
    // Beta Models
    'gpt-4': {
        model: 'gpt-4',
        api: 'gpt',
        maxTokens: 8192,
        beta: true
    },
    'gpt-4-32k': {
        model: 'gpt-4-32k',
        api: 'gpt',
        maxTokens: 32768,
        beta: true
    },
    'code-davinci-002': {
        model: 'code-davinci-002',
        api: 'davinci',
        maxTokens: 8001,
        beta: true
    },
};
exports.modelAlias = {
    'gpt3': 'text-davinci-003',
    'gpt3t': 'gpt-3.5-turbo',
    'gpt4': 'gpt-4',
    'gpt4b': 'gpt-4-32k'
};
