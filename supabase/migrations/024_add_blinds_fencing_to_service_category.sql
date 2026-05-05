-- Add 'fencing' and 'blinds' to the service_category enum so they can be
-- used in leads, vendor_catalog_items, and vendor_option_prices without
-- constraint violations.
alter type service_category add value if not exists 'fencing';
alter type service_category add value if not exists 'blinds';
