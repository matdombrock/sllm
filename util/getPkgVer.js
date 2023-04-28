"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
// Read package.json version number
const packageJSONBuff = fs_1.default.readFileSync(__dirname + '/../package.json');
const packageJSONStr = packageJSONBuff.toString();
const VERSION_NUMBER = JSON.parse(packageJSONStr).version;
exports.default = VERSION_NUMBER;
