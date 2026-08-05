part of '../settings_page.dart';

/// System / Light / Dark, mirroring desktop's appearance-mode selector.
const _modeOptions = <({ThemeMode mode, String label, IconData icon})>[
  (mode: ThemeMode.system, label: 'System', icon: LucideIcons.sunMoon),
  (mode: ThemeMode.light, label: 'Light', icon: LucideIcons.sun),
  (mode: ThemeMode.dark, label: 'Dark', icon: LucideIcons.moon),
];

String _modeLabel(ThemeMode mode) =>
    _modeOptions.firstWhere((option) => option.mode == mode).label;

const _displayStyleOptions =
    <({DisplayStyle style, String label, IconData icon, String description})>[
      (
        style: DisplayStyle.standard,
        label: 'Standard',
        icon: LucideIcons.messageCircle,
        description: 'Bubbles, avatars, and comfortable spacing.',
      ),
      (
        style: DisplayStyle.developer,
        label: 'Developer',
        icon: LucideIcons.terminal,
        description:
            'Dense monospace transcript with per-author colors and '
            'grouped sub-channels, like desktop dev mode.',
      ),
    ];

String _displayStyleLabel(DisplayStyle style) =>
    _displayStyleOptions.firstWhere((option) => option.style == style).label;

class _AppearanceSection extends ConsumerWidget {
  const _AppearanceSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeProvider);
    final schemeName = ref.watch(schemeProvider);
    final accentIndex = ref.watch(accentProvider);
    final displayStyle = ref.watch(displayStyleProvider);

    return AppListCard(
      label: 'Style',
      children: [
        AppListRow(
          icon: LucideIcons.sunMoon,
          title: 'Appearance',
          value: _modeLabel(mode),
          trailing: const _RowChevron(),
          onTap: () => _showAppearanceModeSheet(context),
        ),
        AppListRow(
          icon: LucideIcons.terminal,
          title: 'Display style',
          value: _displayStyleLabel(displayStyle),
          trailing: const _RowChevron(),
          onTap: () => _showDisplayStyleSheet(context),
        ),
        AppListRow(
          icon: LucideIcons.palette,
          title: 'Theme',
          value: themeSelectionLabel(schemeName, mode),
          trailing: const _RowChevron(),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const ThemePickerPage()),
          ),
        ),
        AppListRow(
          icon: LucideIcons.droplet,
          title: 'Accent color',
          // The swatch *is* the value — naming the color as well would say the
          // same thing twice, so it takes the chevron's place.
          trailing: _AccentSwatch(accentIndex: accentIndex),
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const AccentPickerPage()),
          ),
        ),
      ],
    );
  }
}

void _showAppearanceModeSheet(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => const _AppearanceModeSheet(),
  );
}

/// Three choices is too few to warrant a page, so the appearance row opens a
/// sheet rather than pushing a route.
class _AppearanceModeSheet extends ConsumerWidget {
  const _AppearanceModeSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeProvider);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              Grid.gutter,
              0,
              Grid.gutter,
              Grid.xxs,
            ),
            child: Text('Appearance', style: context.textTheme.titleMedium),
          ),
          for (final option in _modeOptions)
            AppListRow(
              icon: option.icon,
              title: option.label,
              trailing: option.mode == mode
                  ? Icon(
                      LucideIcons.check,
                      size: 18,
                      color: context.colors.primary,
                    )
                  : null,
              onTap: () {
                final schemeName = ref.read(schemeProvider);
                final compatibleScheme = schemeForAppearanceMode(
                  schemeName,
                  option.mode,
                );
                if (compatibleScheme != schemeName) {
                  ref.read(schemeProvider.notifier).setScheme(compatibleScheme);
                }
                ref.read(themeProvider.notifier).setMode(option.mode);
                Navigator.of(context).pop();
              },
            ),
          const SizedBox(height: Grid.xxs),
        ],
      ),
    );
  }
}

void _showDisplayStyleSheet(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => const _DisplayStyleSheet(),
  );
}

/// Standard / Developer, mirroring desktop dev mode's display-style toggle.
class _DisplayStyleSheet extends ConsumerWidget {
  const _DisplayStyleSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final style = ref.watch(displayStyleProvider);

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              Grid.gutter,
              0,
              Grid.gutter,
              Grid.xxs,
            ),
            child: Text('Display style', style: context.textTheme.titleMedium),
          ),
          for (final option in _displayStyleOptions)
            AppListRow(
              icon: option.icon,
              title: option.label,
              subtitle: option.description,
              trailing: option.style == style
                  ? Icon(
                      LucideIcons.check,
                      size: 18,
                      color: context.colors.primary,
                    )
                  : null,
              onTap: () {
                ref.read(displayStyleProvider.notifier).setStyle(option.style);
                Navigator.of(context).pop();
              },
            ),
          const SizedBox(height: Grid.xxs),
        ],
      ),
    );
  }
}

/// The selected accent, shown where a row would otherwise carry a chevron.
class _AccentSwatch extends StatelessWidget {
  const _AccentSwatch({required this.accentIndex});

  static const _size = 22.0;

  final int accentIndex;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: _size,
      height: _size,
      decoration: BoxDecoration(
        color: accentColorForScheme(context.colors, accentIndex),
        shape: BoxShape.circle,
        border: Border.all(color: context.colors.outlineVariant),
      ),
    );
  }
}
