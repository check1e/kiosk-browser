import * as electron from 'electron'
import * as fs from 'fs'
import { fakeIpc } from '../../test/ipc'
import mockOf from '../../test/mockOf'
import { defined } from '../utils/assert'
import register, { channel, Client } from './saveAs'

jest.mock('electron', () => ({
  dialog: {
    showSaveDialog: jest.fn(),
  },
}))

jest.mock('fs')

test('open, write, close', async () => {
  const { ipcMain, ipcRenderer } = fakeIpc()

  register(ipcMain, {
    url: new URL('https://example.com/'),
    allowedSaveAsHostnamePatterns: ['*'],
    allowedSaveAsDestinationPatterns: ['**/*'],
  })

  const client = new Client(ipcRenderer.invoke.bind(ipcRenderer))

  // prepare to prompt
  mockOf(electron.dialog.showSaveDialog).mockResolvedValueOnce({
    canceled: false,
    filePath: '/example/path.txt',
  })
  const mockWriteStream: Partial<fs.WriteStream> = {
    write: jest.fn().mockImplementation((_data, cb) => cb()),
    end: jest.fn().mockImplementation(cb => cb()),
  }
  mockOf(fs.createWriteStream).mockReturnValueOnce(
    mockWriteStream as fs.WriteStream,
  )

  // do the prompt
  const promptResult = await client.promptToSave()

  // did it?
  expect(ipcRenderer.invoke).toHaveBeenCalledWith(channel, {
    type: 'PromptToSave',
  })
  expect(electron.dialog.showSaveDialog).toHaveBeenCalled()
  expect(fs.createWriteStream).toHaveBeenCalledWith('/example/path.txt')

  defined(promptResult)
  const { fd } = promptResult

  // do some writes
  await client.write(fd, 'abc')
  expect(mockWriteStream.write).toHaveBeenNthCalledWith(
    1,
    'abc',
    expect.any(Function),
  )

  await client.write(fd, Buffer.of(1, 2, 3))
  expect(mockWriteStream.write).toHaveBeenNthCalledWith(
    2,
    Uint8Array.of(1, 2, 3),
    expect.any(Function),
  )

  // end it
  await client.end(fd)
  expect(mockWriteStream)
})

test('disallows hosts that are not explicitly listed', async () => {
  const url = new URL('https://evil.com/')
  const { ipcMain, ipcRenderer } = fakeIpc({
    getURL() {
      return url.toString()
    },
  })

  register(ipcMain, {
    url,
    allowedSaveAsHostnamePatterns: [],
  })

  const client = new Client(ipcRenderer.invoke.bind(ipcRenderer))

  expect(electron.dialog.showSaveDialog).not.toBeCalled()
  await expect(client.promptToSave()).rejects.toThrowError(
    `evil.com is not allowed to use 'saveAs'`,
  )
})

test('disallows file destinations that are not explicitly listed', async () => {
  const { ipcMain, ipcRenderer } = fakeIpc()

  register(ipcMain, {
    url: new URL('https://example.com/'),
    allowedSaveAsHostnamePatterns: ['example.com'],
    allowedSaveAsDestinationPatterns: ['/media/**/*'],
  })

  const client = new Client(ipcRenderer.invoke.bind(ipcRenderer))

  mockOf(electron.dialog.showSaveDialog).mockResolvedValueOnce({
    canceled: false,
    filePath: '/etc/passwd',
  })
  expect(await client.promptToSave()).toBeUndefined()

  mockOf(electron.dialog.showSaveDialog).mockResolvedValueOnce({
    canceled: false,
    filePath: '/media/allowed/path.txt',
  })
  expect(await client.promptToSave()).toBeDefined()
})

test('does not allow cross-site file access', async () => {
  const { ipcMain, ipcRenderer, setWebContents } = fakeIpc()

  register(ipcMain, {
    url: new URL('https://example.com/'),
    allowedSaveAsHostnamePatterns: ['*'],
    allowedSaveAsDestinationPatterns: ['**/*'],
  })

  const client = new Client(ipcRenderer.invoke.bind(ipcRenderer))

  setWebContents({
    getURL() {
      return 'https://example.com/'
    },
  })

  mockOf(electron.dialog.showSaveDialog).mockResolvedValueOnce({
    canceled: false,
    filePath: '/tmp/test.log',
  })
  const mockWriteStream: Partial<fs.WriteStream> = {
    write: jest.fn().mockImplementation((_data, cb) => cb()),
    end: jest.fn().mockImplementation(cb => cb()),
  }
  mockOf(fs.createWriteStream).mockReturnValueOnce(
    mockWriteStream as fs.WriteStream,
  )

  const promptResult = await client.promptToSave()
  defined(promptResult)

  // the domain that created it should be able to write to it
  await client.write(promptResult.fd, 'example things')
  expect(mockWriteStream.write).toHaveBeenNthCalledWith(
    1,
    'example things',
    expect.any(Function),
  )

  setWebContents({
    getURL() {
      return 'https://evil.com/'
    },
  })

  // but the bad guys should not
  await expect(
    client.write(promptResult.fd, 'evil things'),
  ).rejects.toThrowError(
    `ENOENT: no such file with descriptor '${promptResult.fd}'`,
  )
  expect(mockWriteStream.write).not.toHaveBeenCalledWith(
    'evil things',
    expect.any(Function),
  )
})
