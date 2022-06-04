import {
  convertCharTemp2SystemTemp,
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
