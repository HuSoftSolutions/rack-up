declare module "qrcode" {
  type QRCodeToDataURLOptions = {
    margin?: number;
    width?: number;
    scale?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  const QRCode: {
    toDataURL: (text: string, options?: QRCodeToDataURLOptions) => Promise<string>;
  };

  export default QRCode;
}
