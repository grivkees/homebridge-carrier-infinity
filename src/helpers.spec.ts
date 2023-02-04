import {
  convertCharTemp2SystemTemp,
  convertSystemTemp2CharTemp,
  processSetpointDeadband,
  range,
} from './helpers';

describe('convertCharTemp2SystemTemp', () => {
  test('round C', () => {
    expect(convertCharTemp2SystemTemp(0, 'C')).toEqual(0);
    expect(convertCharTemp2SystemTemp(30, 'C')).toEqual(30);
    expect(convertCharTemp2SystemTemp(30.1, 'C')).toEqual(30);
    expect(convertCharTemp2SystemTemp(30.2, 'C')).toEqual(30);
    expect(convertCharTemp2SystemTemp(30.5, 'C')).toEqual(30.5);
    expect(convertCharTemp2SystemTemp(30.6, 'C')).toEqual(30.5);
    expect(convertCharTemp2SystemTemp(30.9, 'C')).toEqual(31);
  });

  test('round F', () => {
    expect(convertCharTemp2SystemTemp(-18.3, 'F')).toEqual(-1);
    expect(convertCharTemp2SystemTemp(-17.8, 'F')).toEqual(0);
    expect(convertCharTemp2SystemTemp(-17.2, 'F')).toEqual(1);
    expect(convertCharTemp2SystemTemp(-7.8, 'F')).toEqual(18);
    expect(convertCharTemp2SystemTemp(0, 'F')).toEqual(32);
    expect(convertCharTemp2SystemTemp(18, 'F')).toEqual(64);
    expect(convertCharTemp2SystemTemp(30, 'F')).toEqual(86);
    expect(convertCharTemp2SystemTemp(30.1, 'F')).toEqual(86);
    expect(convertCharTemp2SystemTemp(30.4, 'F')).toEqual(87);
    expect(convertCharTemp2SystemTemp(30.5, 'F')).toEqual(87);
    expect(convertCharTemp2SystemTemp(30.6, 'F')).toEqual(87);
    expect(convertCharTemp2SystemTemp(30.9, 'F')).toEqual(88);
  });
});

describe('convertSystemTemp2CharTemp', () => {
  test('round C', () => {
    expect(convertSystemTemp2CharTemp(0, 'C')).toEqual(0);
    expect(convertSystemTemp2CharTemp(30, 'C')).toEqual(30);
    expect(convertSystemTemp2CharTemp(30.1, 'C')).toEqual(30.1);
    expect(convertSystemTemp2CharTemp(30.2, 'C')).toEqual(30.2);
    expect(convertSystemTemp2CharTemp(30.5, 'C')).toEqual(30.5);
    expect(convertSystemTemp2CharTemp(30.6, 'C')).toEqual(30.6);
    expect(convertSystemTemp2CharTemp(30.9, 'C')).toEqual(30.9);
  });

  test('round F', () => {
    expect(convertSystemTemp2CharTemp(-1, 'F')).toEqual(-18.3);
    expect(convertSystemTemp2CharTemp(0, 'F')).toEqual(-17.8);
    expect(convertSystemTemp2CharTemp(1, 'F')).toEqual(-17.2);
    expect(convertSystemTemp2CharTemp(18, 'F')).toEqual(-7.8);
    expect(convertSystemTemp2CharTemp(19, 'F')).toEqual(-7.2);
    expect(convertSystemTemp2CharTemp(20, 'F')).toEqual(-6.7);
    expect(convertSystemTemp2CharTemp(21, 'F')).toEqual(-6.1);
    expect(convertSystemTemp2CharTemp(22, 'F')).toEqual(-5.6);
    expect(convertSystemTemp2CharTemp(30, 'F')).toEqual(-1.1);
    expect(convertSystemTemp2CharTemp(31, 'F')).toEqual(-.6);
    expect(convertSystemTemp2CharTemp(32, 'F')).toEqual(0);
    expect(convertSystemTemp2CharTemp(33, 'F')).toEqual(.6);
    expect(convertSystemTemp2CharTemp(64, 'F')).toEqual(17.8);
    expect(convertSystemTemp2CharTemp(86, 'F')).toEqual(30);
    expect(convertSystemTemp2CharTemp(87, 'F')).toEqual(30.6);
    expect(convertSystemTemp2CharTemp(88, 'F')).toEqual(31.1);
    expect(convertSystemTemp2CharTemp(89, 'F')).toEqual(31.7);
    expect(convertSystemTemp2CharTemp(90, 'F')).toEqual(32.2);
  });
});

describe('convertTemp_back_and_forth', () => {
  test('round C', () => {
    range(-10, 100).forEach(
      x => {
        expect(convertCharTemp2SystemTemp(convertSystemTemp2CharTemp(x, 'C'), 'C')).toEqual(x);
        expect(convertSystemTemp2CharTemp(convertCharTemp2SystemTemp(x, 'C'), 'C')).toEqual(x);
      },
    );
  });

  test('round F', () => {
    range(-10, 100).forEach(
      x => {
        // We lose fidelity going from HK -> Carrier -> HomeKit, since we store
        // to nearest 1/10 degree in HK and 1/2 degree in carrier. And the rounding
        // doesn't work out well because this tests puts in C values that don't
        // map exactly to F.
        // So to make this test work, we need to start with C values that approx
        // F values. And if we want to check both directions that means just
        // nesting both tests.
        expect(
          convertCharTemp2SystemTemp(
            convertSystemTemp2CharTemp(
              convertCharTemp2SystemTemp(
                convertSystemTemp2CharTemp(x, 'F'),
                'F',
              ),
              'F',
            ),
            'F',
          ),
        ).toEqual(x);
      },
    );
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
