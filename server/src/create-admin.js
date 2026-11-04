
import 'dotenv/config';
import { google } from 'googleapis';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';

function askVisible(question) {
    return new Promise((resolve) => {
        const rl = createInterface({ input: stdin, output: stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function askHidden(question) {
    return new Promise((resolve, reject) => {
        if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
            reject(new Error(
                'Please use a normal interactive VS Code terminal.'
            ));
            return;
        }

        stdout.write(question);
        let answer = '';

        const finish = (error) => {
            stdin.setRawMode(false);
            stdin.off('data', onData);
            stdout.write('\n');
            if (error) reject(error);
            else resolve(answer);
        };

        const onData = (chunk) => {
            const key = chunk.toString('utf8');

            if (key === '\u0003') {
                return finish(new Error('Cancelled.'));
            }

            if (key === '\r' || key === '\n') {
                return finish();
            }

            if (key === '\u007f' || key === '\b') {
                answer = answer.slice(0, -1);
                return;
            }

            if (key.length === 1 && key >= ' ') {
                answer += key;
            }
        };

        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', onData);
    });
}

async function main() {
    for (const key of [
        'GOOGLE_SHEET_ID',
        'GOOGLE_APPLICATION_CREDENTIALS'
    ]) {
        if (!process.env[key]) {
            throw new Error(`Missing ${key} in server/.env`);
        }
    }

    const email = (
        await askVisible('First admin email: ')
    ).toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(email)) {
        throw new Error('Enter a valid email address.');
    }

    const fullName = await askVisible('Admin full name: ');

    if (fullName.length < 2 || fullName.length > 100) {
        throw new Error('Full name must be 2–100 characters.');
    }

    const password = await askHidden(
        'Choose admin password (12+ characters): '
    );

    if (password.length < 12 || password.length > 128) {
        throw new Error('Password must be 12–128 characters.');
    }

    const confirmation = await askHidden(
        'Confirm admin password: '
    );

    if (password !== confirmation) {
        throw new Error('Passwords do not match.');
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets'
        ]
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Admins!A2:E'
    });

    const rows = response.data.values ?? [];

    const duplicate = rows.some(
        row => String(row[0] ?? '').trim().toLowerCase() === email
    );

    if (duplicate) {
        throw new Error('This admin email already exists.');
    }

    const ownerExists = rows.some(
        row =>
            String(row[2] ?? '').toLowerCase() === 'owner' &&
            String(row[3] ?? '').toLowerCase() === 'true'
    );

    if (ownerExists) {
        throw new Error('An active owner account already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Admins!A:E',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
            values: [[
                email,
                passwordHash,
                'owner',
                'TRUE',
                fullName
            ]]
        }
    });

    console.log(
        'Initial NOVA Market owner account created successfully.'
    );
}

main().catch(error => {
    console.error('Admin setup failed:', error.message);
    process.exitCode = 1;
});
