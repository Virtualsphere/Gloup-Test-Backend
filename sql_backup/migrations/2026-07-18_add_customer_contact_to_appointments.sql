-- Adds customer contact columns to appointments so every order carries the
-- booker's name, phone, and email (sent by app v2.6.5+ via POST /user/app/v2/createorder).
-- Columns are nullable so existing rows and older app versions remain valid.

ALTER TABLE `appointments`
  ADD COLUMN `customer_name` VARCHAR(100) NULL DEFAULT NULL AFTER `guest_id`,
  ADD COLUMN `customer_phone` VARCHAR(15) NULL DEFAULT NULL AFTER `customer_name`,
  ADD COLUMN `customer_email` VARCHAR(255) NULL DEFAULT NULL AFTER `customer_phone`;
