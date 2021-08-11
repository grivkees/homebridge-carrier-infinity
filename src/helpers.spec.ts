import {
  convertCharDehum2SystemDehum,
  convertCharHum2SystemHum,
  convertCharTemp2SystemTemp,
  convertSystemDehum2CharDehum,
  convertSystemHum2CharHum,
  processSetpointDeadband,
} from './helpers';

describe('convertCharTemp2SystemTemp', () => {
  test('round C', () => {
    expect(convertCharTemp2SystemTemp(30, 'C')).toEqual(30);
    expect(convertCharTemp2SystemTemp(30.1, 'C')).toEqual(30);
    expect(convertCharTemp2SystemTemp(30.2, 'C')).toEqual(30);
    expect(convertCharTemp2SystemTemp(30.5, 'C')).toEqual(30.5);
    expect(convertCharTemp2SystemTemp(30.6, 'C')).toEqual(30.5);
    expect(convertCharTemp2SystemTemp(30.9, 'C')).toEqual(31);
  });

  test('round F', () => {
    expect(convertCharTemp2SystemTemp(30, 'F')).toEqual(86);
    expect(convertCharTemp2SystemTemp(30.1, 'F')).toEqual(86);
    expect(convertCharTemp2SystemTemp(30.4, 'F')).toEqual(87);
    expect(convertCharTemp2SystemTemp(30.5, 'F')).toEqual(87);
    expect(convertCharTemp2SystemTemp(30.9, 'F')).toEqual(88);
  });
});

describe('processSetpointDeadband', () => {
  test('cool above heat', () => {
    expect(processSetpointDeadband(60, 70, 'F', true)).toEqual([60, 70]);
    expect(processSetpointDeadband(68, 70, 'F', true)).toEqual([68, 70]);
    expect(processSetpointDeadband(60, 70, 'F', false)).toEqual([60, 70]);
    expect(processSetpointDeadband(68, 70, 'F', false)).toEqual([68, 70]);
  });

  test('heat close to cool', () => {
    expect(processSetpointDeadband(69, 70, 'F', true)).toEqual([68, 70]);
    expect(processSetpointDeadband(69, 70, 'F', false)).toEqual([69, 71]);
  });

  test('heat = cool', () => {
    expect(processSetpointDeadband(70, 70, 'F', true)).toEqual([68, 70]);
    expect(processSetpointDeadband(70, 70, 'F', false)).toEqual([70, 72]);
  });

  test('heat above cool', () => {
    expect(processSetpointDeadband(72, 70, 'F', true)).toEqual([68, 70]);
    expect(processSetpointDeadband(72, 70, 'F', false)).toEqual([72, 74]);
  });
});

describe('humidity helpers', () => {
  test('convertSystemHum2CharHum', () => {
    expect(convertSystemHum2CharHum(1)).toEqual(5);
    expect(convertSystemHum2CharHum(5)).toEqual(25);
    expect(convertSystemHum2CharHum(8)).toEqual(40);
  });

  test('convertCharHum2SystemHum', () => {
    expect(convertCharHum2SystemHum(40)).toEqual(8);
    expect(convertCharHum2SystemHum(10)).toEqual(2);
  });

  test('there and back again', () => {
    expect(convertCharHum2SystemHum(convertSystemHum2CharHum(1))).toEqual(1);
    expect(convertCharHum2SystemHum(convertSystemHum2CharHum(8))).toEqual(8);
    expect(convertSystemHum2CharHum(convertCharHum2SystemHum(50))).toEqual(50);
    expect(convertSystemHum2CharHum(convertCharHum2SystemHum(60))).toEqual(60);
  });
});

describe('dehumidity helpers', () => {
  test('convertSystemDehum2CharDehum', () => {
    expect(convertSystemDehum2CharDehum(1)).toEqual(46);
    expect(convertSystemDehum2CharDehum(5)).toEqual(54);
    expect(convertSystemDehum2CharDehum(8)).toEqual(60);
  });

  test('convertCharHum2SystemHum', () => {
    expect(convertCharDehum2SystemDehum(60)).toEqual(8);
    expect(convertCharDehum2SystemDehum(80)).toEqual(18);
  });

  test('there and back again', () => {
    expect(convertCharDehum2SystemDehum(convertSystemDehum2CharDehum(1))).toEqual(1);
    expect(convertCharDehum2SystemDehum(convertSystemDehum2CharDehum(8))).toEqual(8);
    expect(convertSystemDehum2CharDehum(convertCharDehum2SystemDehum(50))).toEqual(50);
    expect(convertSystemDehum2CharDehum(convertCharDehum2SystemDehum(60))).toEqual(60);
  });
});
