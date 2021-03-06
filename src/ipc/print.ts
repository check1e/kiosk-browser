import { IpcMain, IpcMainInvokeEvent, PrinterInfo } from 'electron'
import * as z from 'zod'
import exec from '../utils/exec'
import getPreferredPrinter from '../utils/getPreferredPrinter'
import { debug } from '../utils/printing'

export const channel = 'print'

/**
 * This function could be easily inlined, except for this:
 * https://github.com/microsoft/TypeScript/issues/36295
 *
 * So once that bug is fixed we can inline this.
 */
function getPreferredPrinterName(printers: PrinterInfo[]): string | undefined {
  return getPreferredPrinter(printers)?.name
}

const availablePaperSources = ['Tray1', 'Tray2', 'Tray3']

interface PrintOptions {
  deviceName?: string
  paperSource?: string
  copies?: number
}

const PrintOptionsSchema = z.object({
  deviceName: z
    .string()
    .nonempty()
    .optional(),
  paperSource: z
    .string()
    .nonempty()
    .optional(),
  copies: z
    .number()
    .positive()
    .int()
    .optional(),
})

interface PrintDataParameters extends PrintOptions {
  data: Buffer
}

async function printData({
  data,
  deviceName,
  paperSource,
  copies,
}: PrintDataParameters): Promise<void> {
  const lprOptions: string[] = []

  if (deviceName) {
    lprOptions.push('-P', deviceName)
  }

  // duplex
  lprOptions.push('-o', 'sides=two-sided-long-edge')

  // -o already pushed, can add inputslot
  if (paperSource && availablePaperSources.includes(paperSource)) {
    lprOptions.push('InputSlot=' + paperSource)
  }

  if (typeof copies !== 'undefined') {
    lprOptions.push('-#', copies.toString())
  }

  debug('printing via lpr with args=%o', lprOptions)
  debug('data length is %d', data.length)
  const { stdout, stderr } = await exec('lpr', lprOptions, data)
  debug('`lpr` succeeded with stdout=%s stderr=%s', stdout, stderr)
}

/**
 * Enable directly printing without a prompt.
 */
export default function register(ipcMain: IpcMain): void {
  ipcMain.handle(
    channel,
    async (event: IpcMainInvokeEvent, options: PrintOptions = {}) => {
      const { deviceName, paperSource, copies } = PrintOptionsSchema.parse(
        options,
      )

      debug('printing to PDF')
      const data = await event.sender.printToPDF({
        printBackground: true,
      })
      debug('printed to PDF, size=%d', data.length)

      await printData({
        data,
        deviceName:
          deviceName ?? getPreferredPrinterName(event.sender.getPrinters()),
        paperSource,
        copies,
      })
    },
  )
}
