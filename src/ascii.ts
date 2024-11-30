export const ASCII = {
  VT: String.fromCharCode(0x0b),
  VTi: 0x0b,
  FS: String.fromCharCode(0x1c),
  // FSi: 0x1c;
  CR: String.fromCharCode(0x0d),
  // CRi : 0x0d;
};

export const MLLP_SEPARATOR = ASCII.FS + ASCII.CR;
