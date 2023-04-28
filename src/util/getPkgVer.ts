import fs from 'fs';
// Read package.json version number
const packageJSONBuff: Buffer = fs.readFileSync(__dirname + '/../../package.json');
const packageJSONStr: string = packageJSONBuff.toString();
const VERSION_NUMBER: any = JSON.parse(
	packageJSONStr
).version;

export default VERSION_NUMBER;