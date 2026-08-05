import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/theme/theme_provider.dart';

const _displayStyleKey = 'buzz_display_style';

/// App-wide display style, mirroring desktop's `buzz.displayStyle` preference.
enum DisplayStyle { standard, developer }

class DisplayStyleNotifier extends Notifier<DisplayStyle> {
  @override
  DisplayStyle build() {
    final stored = ref.read(savedPrefsProvider).getString(_displayStyleKey);
    return DisplayStyle.values.where((s) => s.name == stored).firstOrNull ??
        DisplayStyle.standard;
  }

  void setStyle(DisplayStyle style) {
    state = style;
    ref.read(savedPrefsProvider).setString(_displayStyleKey, style.name);
  }

  void toggle() {
    setStyle(
      state == DisplayStyle.developer
          ? DisplayStyle.standard
          : DisplayStyle.developer,
    );
  }
}

final displayStyleProvider =
    NotifierProvider<DisplayStyleNotifier, DisplayStyle>(
      DisplayStyleNotifier.new,
    );
