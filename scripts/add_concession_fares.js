/** Read-only reconciliation. --patch emits an apply_patch patch; never writes files. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const matrixPath = path.join(root, 'src/data/fareMatrix.ts');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/official-rail-fares-2026.json'), 'utf8'));

function readLiteral(node) {
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (!ts.isObjectLiteralExpression(node)) throw new Error('Fare matrix must contain only object/number literals');
    return Object.fromEntries(node.properties.map(property => {
        if (!ts.isPropertyAssignment(property) || !property.name || !('text' in property.name)) {
            throw new Error('Unsupported fare matrix property');
        }
        return [property.name.text, readLiteral(property.initializer)];
    }));
}

function readMatrix(source) {
    const file = ts.createSourceFile(matrixPath, source, ts.ScriptTarget.Latest, true);
    for (const statement of file.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        const declaration = statement.declarationList.declarations.find(item => item.name.getText(file) === 'FARE_MATRIX');
        if (declaration?.initializer) return readLiteral(declaration.initializer);
    }
    throw new Error('FARE_MATRIX declaration not found');
}

function numericRows(line, key) {
    const rows = typeof line[key] === 'string' ? line[line[key]] : line[key];
    if (rows === null) return null;
    if (!Array.isArray(rows) || rows.length !== line.stationIds.length) throw new Error('Invalid ' + key + ' row count');
    for (const row of rows) {
        if (!Array.isArray(row) || row.length !== line.stationIds.length || row.some(value => !Number.isFinite(value) || value < 0)) {
            throw new Error('Invalid ' + key + ' cells');
        }
    }
    return rows;
}

function reconcile(matrix) {
    const repaired = structuredClone(matrix);
    const changes = [];
    const unknown = [];
    const knownIds = new Set();
    for (const [lineId, line] of Object.entries(fixture.lines)) {
        if (new Set(line.stationIds).size !== line.stationIds.length) throw new Error(lineId + ': duplicate station ID');
        line.stationIds.forEach(id => knownIds.add(id));
        for (const key of ['SJT', 'BEEP', 'CONCESSION']) {
            const rows = numericRows(line, key);
            for (let i = 0; i < line.stationIds.length; i++) for (let j = 0; j < line.stationIds.length; j++) {
                if (i === j) continue;
                const from = line.stationIds[i];
                const to = line.stationIds[j];
                const entry = repaired[from]?.[to];
                if (!entry || !Number.isFinite(entry[key])) throw new Error(from + '->' + to + ': missing ' + key);
                if (rows === null) {
                    unknown.push({ lineId, from, to, key });
                    continue;
                }
                if (entry[key] !== rows[i][j]) changes.push({ from, to, key, before: entry[key], after: rows[i][j] });
                entry[key] = rows[i][j];
            }
        }
    }
    // This tool must never change bus, future-line, or cross-line data.
    for (const [from, destinations] of Object.entries(matrix)) {
        for (const [to, entry] of Object.entries(destinations)) {
            if (!knownIds.has(from) || !knownIds.has(to)) {
                if (JSON.stringify(repaired[from][to]) !== JSON.stringify(entry)) throw new Error('Unowned fare changed');
            }
        }
    }
    return { repaired, changes, unknown };
}

function main() {
    const source = fs.readFileSync(matrixPath, 'utf8');
    const matrix = readMatrix(source);
    const result = reconcile(matrix);
    if (process.argv.includes('--patch')) {
        if (!result.changes.length) {
            console.warn('No verified fare corrections needed; unresolved concession cells remain unchanged.');
            return;
        }
        process.stdout.write('*** Begin Patch\n*** Update File: ' + matrixPath.replaceAll('\\', '/') + '\n');
        for (const [from, destinations] of Object.entries(matrix)) {
            const changed = Object.entries(destinations).filter(([to, entry]) => JSON.stringify(entry) !== JSON.stringify(result.repaired[from][to]));
            if (!changed.length) continue;
            process.stdout.write('@@   "' + from + '": {\n');
            for (const [index, [to, entry]] of changed.entries()) {
                process.stdout.write((index === 0 ? '     "' : '@@     "') + to + '": {\n');
                for (const key of ['SJT', 'BEEP', 'CONCESSION']) {
                    const suffix = key === 'CONCESSION' ? '' : ',';
                    const before = '      "' + key + '": ' + entry[key] + suffix + '\n';
                    const after = '      "' + key + '": ' + result.repaired[from][to][key] + suffix + '\n';
                    process.stdout.write(before === after ? ' ' + before : '-' + before + '+' + after);
                }
            }
        }
        process.stdout.write('*** End Patch\n');
        return;
    }
    console.log(JSON.stringify({ verifiedCellChangesNeeded: result.changes.length, unresolvedCells: result.unknown.length, changes: result.changes }, null, 2));
    console.warn('Unverified LRT1 concession cells are retained; this script does not infer discounts or reset station IDs.');
    if (result.changes.length) process.exitCode = 1;
}

module.exports = { readMatrix, numericRows, reconcile };
if (require.main === module) main();
