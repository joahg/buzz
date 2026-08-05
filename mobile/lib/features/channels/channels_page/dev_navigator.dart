part of '../channels_page.dart';

/// Dev-mode channel navigator: a dense, monospace list of channel families
/// mirroring desktop dev mode's left navigator. Parent channels of a
/// `parent--sub` family carry the family's aggregate unread/activity state;
/// subs render indented beneath their parent.
class _DevSliverChannelsList extends HookConsumerWidget {
  final List<Channel> channels;
  final String? currentPubkey;
  final Future<void> Function(Channel channel) onSelectChannel;

  const _DevSliverChannelsList({
    required this.channels,
    required this.currentPubkey,
    required this.onSelectChannel,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final readState = ref.watch(readStateProvider);
    final mutesState = ref.watch(channelMutesProvider);
    final mutedChannelIds = {
      for (final entry in mutesState.store.channels.entries)
        if (entry.value.muted) entry.key,
    };
    final starsState = ref.watch(channelStarsProvider);
    final starredChannelIds = {
      for (final entry in starsState.store.channels.entries)
        if (entry.value.starred) entry.key,
    };
    final visibleChannels = channels
        .where((channel) => channel.isMember && !channel.isArchived)
        .toList();

    final seedCompleteForPubkey = _useInitialReadSeed(
      context: context,
      ref: ref,
      readState: readState,
      visibleChannels: visibleChannels,
    );

    final unreadState = _computeUnreadChannelState(
      channels: visibleChannels,
      readState: readState,
      channelsNotifier: ref.read(channelsProvider.notifier),
    );
    final unreadChannelIds = {
      for (final channelId in unreadState.ids)
        if (seedCompleteForPubkey ||
            readState.effectiveTimestamp(channelId) != null)
          channelId,
    };

    final families = buildChannelFamilies(
      visibleChannels.where((channel) => channel.isStream).toList(),
    );
    // A family is starred when any member is: subs have no starred row of
    // their own, so a starred sub pins its whole family.
    bool familyStarred(ChannelFamily family) =>
        family.members.any((channel) => starredChannelIds.contains(channel.id));
    final starredFamilies = families.where(familyStarred).toList();
    final otherFamilies = families
        .where((family) => !familyStarred(family))
        .toList();
    final dmChannels = sortChannelsForList(
      visibleChannels.where((channel) => channel.isDm).toList(),
      ChannelSortMode.recent,
    );

    // Muted members don't light up the parent row, but an unmuted member's
    // unread still shows through a muted parent.
    bool familyUnread(ChannelFamily family) => family.members.any(
      (channel) =>
          unreadChannelIds.contains(channel.id) &&
          !mutedChannelIds.contains(channel.id),
    );

    // The parent row carries the family's aggregate unread, so "Mark Read"
    // on it must clear every unread member — not just the parent itself.
    void markFamilyRead(ChannelFamily family) {
      final readNotifier = ref.read(readStateProvider.notifier);
      final channelsNotifier = ref.read(channelsProvider.notifier);
      for (final channel in family.members) {
        if (!unreadChannelIds.contains(channel.id)) continue;
        final timestamp = dateTimeToUnixSeconds(channel.lastMessageAt);
        if (timestamp == null) continue;
        readNotifier.markContextRead(
          channel.id,
          timestamp,
          clearForcedMessages: true,
        );
        channelsNotifier.clearObservedUnreadCoveredByRead(
          channel.id,
          timestamp,
        );
      }
    }

    List<Widget> familyRows(ChannelFamily family) => [
      _DevChannelRow(
        channel: family.parent,
        label: family.parent.name,
        isUnread: familyUnread(family),
        isMuted: mutedChannelIds.contains(family.parent.id),
        activityTime: family.lastActivity,
        currentPubkey: currentPubkey,
        onTap: () => onSelectChannel(family.parent),
        onMarkRead: () => markFamilyRead(family),
      ),
      for (final sub in family.subs)
        _DevChannelRow(
          channel: sub,
          label: subChannelLabel(sub.name),
          isSub: true,
          isUnread: unreadChannelIds.contains(sub.id),
          isMuted: mutedChannelIds.contains(sub.id),
          activityTime: sub.lastMessageAt,
          currentPubkey: currentPubkey,
          onTap: () => onSelectChannel(sub),
        ),
    ];

    return SliverPadding(
      padding: EdgeInsets.only(
        top: Grid.xxs,
        bottom: MediaQuery.paddingOf(context).bottom,
      ),
      sliver: SliverList.list(
        children: [
          if (visibleChannels.isEmpty)
            const _EmptyState()
          else ...[
            if (starredFamilies.isNotEmpty) ...[
              const _DevSectionLabel('starred'),
              for (final family in starredFamilies) ...familyRows(family),
              const _DevSectionDivider(),
            ],
            for (final family in otherFamilies) ...familyRows(family),
            if (dmChannels.isNotEmpty) ...[
              const _DevSectionDivider(),
              const _DevSectionLabel('dms'),
              for (final dm in dmChannels)
                _DevChannelRow(
                  channel: dm,
                  label: resolveDmChannelDisplayLabel(
                    dm,
                    currentPubkey: currentPubkey,
                  ),
                  isUnread: unreadChannelIds.contains(dm.id),
                  isMuted: mutedChannelIds.contains(dm.id),
                  activityTime: dm.lastMessageAt,
                  currentPubkey: currentPubkey,
                  onTap: () => onSelectChannel(dm),
                ),
            ],
          ],
        ],
      ),
    );
  }
}

class _DevSectionLabel extends StatelessWidget {
  final String label;

  const _DevSectionLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        _kChannelSectionInset,
        Grid.xxs,
        _kChannelSectionInset,
        Grid.quarter,
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontFamily: 'GeistMono',
          fontSize: 11,
          letterSpacing: 1.2,
          color: context.colors.onSurfaceVariant.withValues(alpha: 0.6),
        ),
      ),
    );
  }
}

class _DevSectionDivider extends StatelessWidget {
  const _DevSectionDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: _kChannelSectionInset,
        vertical: Grid.xxs,
      ),
      child: Container(
        height: 1,
        color: context.colors.outlineVariant.withValues(alpha: 0.5),
      ),
    );
  }
}

class _DevChannelRow extends ConsumerWidget {
  final Channel channel;
  final String label;
  final bool isSub;
  final bool isUnread;
  final bool isMuted;
  final DateTime? activityTime;
  final String? currentPubkey;
  final VoidCallback onTap;

  /// Extra mark-read work beyond the row's own channel (family aggregation);
  /// forwarded to the channel actions sheet.
  final VoidCallback? onMarkRead;

  const _DevChannelRow({
    required this.channel,
    required this.label,
    this.isSub = false,
    required this.isUnread,
    required this.isMuted,
    required this.activityTime,
    required this.currentPubkey,
    required this.onTap,
    this.onMarkRead,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mutedColor = context.colors.onSurfaceVariant;
    final nameColor = isUnread
        ? context.colors.onSurface
        : isMuted
        ? mutedColor.withValues(alpha: 0.6)
        : mutedColor;
    final time = activityTime;

    return InkWell(
      key: ValueKey('dev-channel-row-${channel.id}'),
      onTap: onTap,
      onLongPress: () => showChannelActionsSheet(
        context: context,
        channel: channel,
        isUnread: isUnread,
        onMarkRead: onMarkRead,
        sectionId: ref
            .read(channelSectionsProvider)
            .store
            .assignments[channel.id],
      ),
      child: Padding(
        padding: EdgeInsets.only(
          left: _kChannelSectionInset + (isSub ? Grid.gutter : 0),
          right: _kChannelSectionInset,
          top: Grid.half,
          bottom: Grid.half,
        ),
        child: Row(
          children: [
            Text(
              channel.isDm ? '@' : '#',
              style: TextStyle(
                fontFamily: 'GeistMono',
                fontSize: isSub ? 12 : 13,
                color: mutedColor.withValues(alpha: 0.5),
              ),
            ),
            const SizedBox(width: Grid.half),
            Expanded(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'GeistMono',
                  fontSize: isSub ? 12 : 13,
                  fontWeight: isUnread ? FontWeight.w700 : FontWeight.w400,
                  color: nameColor,
                ),
              ),
            ),
            if (isMuted) ...[
              const SizedBox(width: Grid.half),
              Icon(
                LucideIcons.bellOff,
                size: 11,
                color: mutedColor.withValues(alpha: 0.6),
              ),
            ],
            if (isUnread) ...[
              const SizedBox(width: Grid.half),
              Text(
                '●',
                key: ValueKey('dev-unread-dot-${channel.id}'),
                style: TextStyle(fontSize: 8, color: context.colors.primary),
              ),
            ],
            if (time != null) ...[
              const SizedBox(width: Grid.half),
              Text(
                devRelativeTime(time),
                style: TextStyle(
                  fontFamily: 'GeistMono',
                  fontSize: 11,
                  color: mutedColor.withValues(alpha: 0.5),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
