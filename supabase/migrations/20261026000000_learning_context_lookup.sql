-- Training/scheduling read the newest immutable context in each channel.
-- Index the JSON channel so finding a missing/older preview does not detoast
-- every historical catalogue. No records, permissions or policies change.
create index if not exists learning_context_channel_order
  on public.learning_records (user_id, (data->>'channel'), ordinal desc)
  where kind='context';
