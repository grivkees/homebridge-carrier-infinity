import {
  convertCharTemp2SystemTemp,
  convertSystemTemp2CharTemp,
  processSetpointDeadband,
  range,
  convertSystemHum2CharHum,
  convertCharHum2SystemHum,
  convertSystemDehum2CharDehum,
  convertCharDehum2SystemDehum,
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

describe('convertSystemHum2CharHum', () => {
  test('converts API value to percentage', () => {
    // rhtg value * 5 = percentage
    expect(convertSystemHum2CharHum(1)).toEqual(5);   // 1 * 5 = 5%
    expect(convertSystemHum2CharHum(7)).toEqual(35);  // 7 * 5 = 35%
    expect(convertSystemHum2CharHum(8)).toEqual(40);  // 8 * 5 = 40%
    expect(convertSystemHum2CharHum(9)).toEqual(45);  // 9 * 5 = 45%
  });

  test('clamps to valid range 5-45%', () => {
    expect(convertSystemHum2CharHum(0)).toEqual(5);   // 0 -> minimum 5%
    expect(convertSystemHum2CharHum(-1)).toEqual(5);  // negative -> minimum 5%
    expect(convertSystemHum2CharHum(10)).toEqual(45); // 10 * 5 = 50 -> clamped to 45%
    expect(convertSystemHum2CharHum(20)).toEqual(45); // way over -> clamped to 45%
  });

  test('handles NaN and undefined gracefully', () => {
    expect(convertSystemHum2CharHum(NaN)).toEqual(5);
    expect(convertSystemHum2CharHum(Infinity)).toEqual(5);
    expect(convertSystemHum2CharHum(-Infinity)).toEqual(5);
  });
});

describe('convertCharHum2SystemHum', () => {
  test('converts percentage to API value', () => {
    // percentage / 5 = rhtg value
    expect(convertCharHum2SystemHum(5)).toEqual(1);   // 5% / 5 = 1
    expect(convertCharHum2SystemHum(35)).toEqual(7);  // 35% / 5 = 7
    expect(convertCharHum2SystemHum(40)).toEqual(8);  // 40% / 5 = 8
    expect(convertCharHum2SystemHum(45)).toEqual(9);  // 45% / 5 = 9
  });

  test('clamps to valid range before converting', () => {
    expect(convertCharHum2SystemHum(0)).toEqual(1);   // 0 -> clamped to 5% -> 1
    expect(convertCharHum2SystemHum(3)).toEqual(1);   // 3 -> clamped to 5% -> 1
    expect(convertCharHum2SystemHum(50)).toEqual(9);  // 50 -> clamped to 45% -> 9
    expect(convertCharHum2SystemHum(100)).toEqual(9); // 100 -> clamped to 45% -> 9
  });

  test('handles NaN gracefully', () => {
    expect(convertCharHum2SystemHum(NaN)).toEqual(1);
    expect(convertCharHum2SystemHum(Infinity)).toEqual(1);
  });
});

describe('convertSystemDehum2CharDehum', () => {
  test('converts API value to percentage', () => {
    // rclg value: percentage = 44 + (rclg * 2), valid range 46-58%
    expect(convertSystemDehum2CharDehum(1)).toEqual(46);  // 44 + 2 = 46%
    expect(convertSystemDehum2CharDehum(4)).toEqual(52);  // 44 + 8 = 52%
    expect(convertSystemDehum2CharDehum(7)).toEqual(58);  // 44 + 14 = 58%
  });

  test('clamps to valid range 46-58%', () => {
    expect(convertSystemDehum2CharDehum(0)).toEqual(58);  // 0 -> maximum 58% (off)
    expect(convertSystemDehum2CharDehum(-1)).toEqual(58); // negative -> maximum 58%
    expect(convertSystemDehum2CharDehum(8)).toEqual(58);  // 44 + 16 = 60 -> clamped to 58%
    expect(convertSystemDehum2CharDehum(20)).toEqual(58); // way over -> clamped to 58%
  });

  test('handles NaN gracefully', () => {
    expect(convertSystemDehum2CharDehum(NaN)).toEqual(58);
    expect(convertSystemDehum2CharDehum(Infinity)).toEqual(58);
  });
});

describe('convertCharDehum2SystemDehum', () => {
  test('converts percentage to API value', () => {
    // rclg = (percentage - 44) / 2, valid range 1-7
    expect(convertCharDehum2SystemDehum(46)).toEqual(1);  // (46-44)/2 = 1
    expect(convertCharDehum2SystemDehum(52)).toEqual(4);  // (52-44)/2 = 4
    expect(convertCharDehum2SystemDehum(58)).toEqual(7);  // (58-44)/2 = 7
  });

  test('clamps to valid range before converting', () => {
    expect(convertCharDehum2SystemDehum(40)).toEqual(1);  // 40 -> clamped to 46% -> 1
    expect(convertCharDehum2SystemDehum(44)).toEqual(1);  // 44 -> clamped to 46% -> 1
    expect(convertCharDehum2SystemDehum(60)).toEqual(7);  // 60 -> clamped to 58% -> 7
    expect(convertCharDehum2SystemDehum(100)).toEqual(7); // 100 -> clamped to 58% -> 7
  });

  test('handles NaN gracefully', () => {
    expect(convertCharDehum2SystemDehum(NaN)).toEqual(7);
    expect(convertCharDehum2SystemDehum(Infinity)).toEqual(7);
  });
});

describe('humidity conversion round trip', () => {
  test('humidifier values round trip correctly', () => {
    // Valid API values (1-9) should round trip
    [1, 3, 5, 7, 9].forEach(apiValue => {
      const percentage = convertSystemHum2CharHum(apiValue);
      const backToApi = convertCharHum2SystemHum(percentage);
      expect(backToApi).toEqual(apiValue);
    });
  });

  test('dehumidifier values round trip correctly', () => {
    // Valid API values (1-7) should round trip
    [1, 2, 3, 4, 5, 6, 7].forEach(apiValue => {
      const percentage = convertSystemDehum2CharDehum(apiValue);
      const backToApi = convertCharDehum2SystemDehum(percentage);
      expect(backToApi).toEqual(apiValue);
    });
  });
});
