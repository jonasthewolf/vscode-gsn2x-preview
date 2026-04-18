import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Test Suite', function () {
  it('activates the extension', async function () {
    const extension = vscode.extensions.getExtension('org.jonaswolf.vscode-gsn-preview');
    assert.ok(extension, 'Extension must be present');

    await extension!.activate();
    assert.strictEqual(extension!.isActive, true, 'Extension must activate successfully');
  });
});
