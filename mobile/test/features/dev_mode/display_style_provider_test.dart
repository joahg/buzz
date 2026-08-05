import 'package:buzz/features/dev_mode/display_style_provider.dart';
import 'package:buzz/shared/theme/theme_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  Future<ProviderContainer> pumpContainer({
    Map<String, Object> initialPrefs = const {},
  }) async {
    SharedPreferences.setMockInitialValues(initialPrefs);
    final prefs = await SharedPreferences.getInstance();
    final container = ProviderContainer(
      overrides: [savedPrefsProvider.overrideWithValue(prefs)],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('defaults to standard', () async {
    final container = await pumpContainer();
    expect(container.read(displayStyleProvider), DisplayStyle.standard);
  });

  test('restores a persisted style', () async {
    final container = await pumpContainer(
      initialPrefs: {'buzz_display_style': 'developer'},
    );
    expect(container.read(displayStyleProvider), DisplayStyle.developer);
  });

  test('falls back to standard on an unknown persisted value', () async {
    final container = await pumpContainer(
      initialPrefs: {'buzz_display_style': 'bogus'},
    );
    expect(container.read(displayStyleProvider), DisplayStyle.standard);
  });

  test('setStyle updates state and persists', () async {
    final container = await pumpContainer();

    container
        .read(displayStyleProvider.notifier)
        .setStyle(DisplayStyle.developer);

    expect(container.read(displayStyleProvider), DisplayStyle.developer);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('buzz_display_style'), 'developer');
  });

  test('toggle flips between styles', () async {
    final container = await pumpContainer();
    final notifier = container.read(displayStyleProvider.notifier);

    notifier.toggle();
    expect(container.read(displayStyleProvider), DisplayStyle.developer);

    notifier.toggle();
    expect(container.read(displayStyleProvider), DisplayStyle.standard);
  });
}
