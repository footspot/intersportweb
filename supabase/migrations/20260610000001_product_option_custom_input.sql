-- * product_options — optional free-text customer input per paid add-on.
-- *
-- * Some options need the customer to type a value (e.g. a custom jersey
-- * number, an engraving name). `allow_custom_input` turns the input on; the
-- * input is always OPTIONAL for the customer (they can tick the option and
-- * leave it blank). `input_label` is the prompt shown next to the field.
-- *
-- * No new table → no fresh GRANTs needed; the existing public-read /
-- * service-role-write policies on product_options already cover these columns.
alter table public.product_options
  add column if not exists allow_custom_input boolean not null default false,
  add column if not exists input_label text;
