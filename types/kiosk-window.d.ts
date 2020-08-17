import { Device } from 'usb-detection'
import { Observable } from 'rxjs'
import { PrinterInfo } from '../src/ipc/get-printer-info'
import { BatteryInfo } from '../src/ipc/get-battery-info'

declare namespace KioskBrowser {
  interface PrintOptions {
    deviceName?: string
    paperSource?: string
    copies?: number
  }

  interface Kiosk {
    getBatteryInfo(): Promise<BatteryInfo>
    getPrinterInfo(): Promise<PrinterInfo[]>
    devices: Observable<Iterable<Device>>
    print(options?: KioskBrowser.PrintOptions): Promise<void>
    print(
      deviceName?: string,
      paperSource?: string,
      copies?: number,
    ): Promise<void>
    quit(): void
  }
}

declare global {
  interface Window {
    kiosk?: KioskBrowser.Kiosk
  }
}
