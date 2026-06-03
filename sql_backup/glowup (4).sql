-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: localhost
-- Generation Time: Jun 30, 2025 at 01:02 PM
-- Server version: 10.4.28-MariaDB
-- PHP Version: 8.2.4

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `glowup`
--

-- --------------------------------------------------------

--
-- Table structure for table `admin`
--

CREATE TABLE `admin` (
  `id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `username` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `otp` varchar(255) DEFAULT NULL,
  `otpexpiration` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `admin`
--

INSERT INTO `admin` (`id`, `name`, `password`, `username`, `email`, `otp`, `otpexpiration`, `status`) VALUES
(1, 'admin', '$2a$10$Gdj7riOr8UM5omRhb/6g1e9UbXN7qcaR52nmvSAqBUkIUPFFjTlhi', 'Admin123', 'gloup@gmail.com', NULL, NULL, 'active');

-- --------------------------------------------------------

--
-- Table structure for table `Adminnotificationlogs`
--

CREATE TABLE `Adminnotificationlogs` (
  `id` int(11) NOT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `notification_type` enum('general','subscription') DEFAULT NULL,
  `sent_to` enum('all','store','user') DEFAULT NULL,
  `date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Adminnotificationlogs`
--

INSERT INTO `Adminnotificationlogs` (`id`, `store_id`, `notification_type`, `sent_to`, `date`) VALUES
(1, NULL, 'general', 'all', '2025-06-26 21:23:14');

-- --------------------------------------------------------

--
-- Table structure for table `adminSession`
--

CREATE TABLE `adminSession` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `token` longtext DEFAULT NULL,
  `ipv4` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `adminSession`
--

INSERT INTO `adminSession` (`id`, `user_id`, `token`, `ipv4`, `status`, `created_at`, `updated_at`) VALUES
(1, 1, 'U2FsdGVkX195kKr+A6ZkW3C8s1gHkRmG0wKWFKa+zmAwP0Ph8VlXBYxW9i5kSFkAt694PKgSq+R5cmY3ohYQq0LGmkU/9OTGETeBfKHGiQclNtcUzuAM2nvfGI3B5QD23lJmfnfR1SA68MOw919Li3G7LnYYFu/ZomS68PKgs8hU1olwFdbUnX8x4hjxQETHkAw6WAWiI5omPDUsE1dalUpDwXxYmOMAq4t8t7Tsc+MZCuVWO6IRUxNhBnc+5Kz1', NULL, 'inactive', NULL, NULL),
(2, 1, 'U2FsdGVkX1/nSfG8TopNG2fF5eq4iEtjAhWCdECGL1yoha0HMb8s9/mj4ntg5XXB32FPOxZWJnQJCbhzOyt9Dpt0ExLiuA6DRcmprSI9rRg3mXi25OvcuWG5LLVynAWxHJxJRedQQspIbijP6dIFHGZUWqAOm5ipoPJwNgz2a834hkFuQ4GxoQWvs5vmUtDmlAqCOnijrKRXSgZ7yacWCfXoy46r0670Ga9q1RXJBC+zjFRJdhFJ8fgcSm7Xi8ZO', NULL, 'inactive', NULL, NULL),
(3, 1, 'U2FsdGVkX1/Sas6bDAGqGg0WhvZDPWHGeKrWEy3Cxxb9HQraxjmKlVT5X/toR2jGxRN6j7+j5rzBlA0eJ3/K+WYtepf9Mryp0sY7OrSZP4QdnwnaWJJDSnDZfjRGYGxz04LhpNELL8gZ+qIGS130l+WEzY+wlI57kwY3AGnoOleA0ABfPt+HmeLxpVuE31dN9j3g8q72+unFUD3kYst0LD2LiAt8Pz9IamJm8E7iGuA905ICEC12VAdn1yRY8jSj', NULL, 'inactive', NULL, NULL),
(4, 1, 'U2FsdGVkX1+Jqs9HWdBYwGFwDXWC3HqMH0LwAUafV4GTGQKDngeHA0tTibYL8JgwCCDw6jXlxImasoKfh0RpbL7tWXXOKKE8OXz3H+VifqOvDcdKzAtDvCsB6sq2N09xWurhjNEotlOheD8myZoPiT792uJvtfMS0Faq+UKjF5mqaM/HCmX9kI1qaeoSrPprXADVGtYuPXs4VbUN235jD+XmkDY3euo7RqxRKM0+6iWXE1xifE7/HTwSiCh4yaAX', NULL, 'inactive', NULL, NULL),
(5, 1, 'U2FsdGVkX1/x8QEZUqxJmGmST2suYk4ZE+cm3G+Npi9hpwOMI0m4AyToWSpjLi7oylsl8IVcZjrmy2HNvmjNpMeM01WjM1H5Rpvr+SW27NioumR5lfBuyuC1ss/7HdamNwbdvSdex/iDGbbwRc6Fycr/hhHB6VDfuuh3e2ynYSaMJPzfArnT9QeSNulrpF16+cFq/I16s5tq58PpToEBC5nmssMYTcMPulXozxKVI58Fobk3wt6bkXIFljqqUin/', NULL, 'inactive', NULL, NULL),
(6, 1, 'U2FsdGVkX1+2ueeavkQsSwRMwaT+BNHQKibO5hrH5Q4PixxTo5OPSj3daeHO28fuwcUQ79j1jbJBRotKt1ejEc2gsBANKLmsIdDx9ffVfoyrXm4cg7qFKfBPA8y4IrQ/9XPvAM8WUBEdUzlrieEN3l2tvwYohmy29qfvdtVr/VMqH/cqD7oaGm7TbipuBVmYlGvoBXrucB4ycsmgFaXEaMJYQ6zgCc5KmVx+DDzX071bXlo9shO/E6n3Xj7QRHET', NULL, 'inactive', NULL, NULL),
(7, 1, 'U2FsdGVkX1+BJ8AGGk+fzpkxM2vP2P8fSOQ1qfkCkAu/8mdN8eOQf8VipbfbXUYYAdl8IYyXxo2y4nqceCjpNVJ+e0T25K9O0hDlCN2bFidg6T+UaCgzCsodZzq/1wek5zwTr9e5U+wMGXeLhe2E9Mba2K9aPj6KwfjzxiMkimLyOnMBuf8/9VvK04VxKeyhqS65RxLVQwqm38CPV0/EpmyFpnL7FS8upXDr+Fba1zL3DxhwUWXgWbPTMMXJ2YSn', NULL, 'inactive', NULL, NULL),
(8, 1, 'U2FsdGVkX180hs9JFoe/Jfz7YVpy0SKi93fbQZHnjWaPeD6YYx8IPvSpaAjwJgLJMjRSOV4Ut15OIqterTzE8UIbobRvzSMlOIYhuUcNvdbXbFm91EWnChOU+XLUdzPmdZUIvbVXGgyXmup6GBL2AarI7OabU0uCcz7uc0lBxrMbwRMr15WgsvT5OMO7nV8ir1OPhaS/1yB+Axgxo2Oye0H/1T/lKFB9aB8E/D7YJVqzEEWWIy891cmvCDq9VB1K', NULL, 'inactive', NULL, NULL),
(9, 1, 'U2FsdGVkX1/qedHzl3KH3IRaJ6Pam9g4Xn4L5uT63w/+9OSlNl9eQCCKwbKMr/z905LPJzHFiBDajuEWXelo7PkwFvKQ6XtP/Wu8beo+jiGZ12ldvjrWN2VrOL14bCJMIkWWs+Pto9OcUEVr6/QO4bbigiFkWmekrwO49jCDYHEzGEeR95j3DbLsPaYov0vi0taCB7Dh/17Cfj2Cyfbn++cEKxJEzYwR1Jz0N1Oj9sE9y08EPpvxAZahwkITXscL', NULL, 'inactive', NULL, NULL),
(10, 1, 'U2FsdGVkX18iyXI/PpPG2c9TN/0sYS7NFTqjyeZrBUA3rqyvIVD73Qw1hu5XBQnCF5hDUiY1pOEpS0HnMfo/izIh9Jh2JSNbXgUAbcBIqIW71tUzzjMEFMBajM+N06BzqHP71lheBSwOBnsGxsdq9FJmIFb8Nq4DOEkGdNX39ehgvpcw3WOpJZSFlQcCCOhaxJ5cSiqjl2vFbBtwaoEGvsyIv6+xgJJXoyQm7wLaQTqhxFLjURpD5UvfOXUfdnO4', NULL, 'inactive', NULL, NULL),
(11, 1, 'U2FsdGVkX19xIDopj+8TedoWxRtG+bKzAu8CY0urkFTQo7JscD48MD12E9RWv8AXObrwrrAj+L8eZmxqr2yQdV3+/VO3WurqZMUx67IXTe9/o5fsGBB5GOAdDg9SFixkPneXp7lk1kxGuRTneHDYgb8yOABEaiGxiD+n8RD+VhvntBWNP/sDDayQQc8fchlBefjeYS0EWBaYDB39uJJxA8D3Z+VTQ47WJH72Pa/QTj83lYTm22ROO2ybmuTE/9Qp', NULL, 'inactive', NULL, NULL),
(12, 1, 'U2FsdGVkX1+Xu8oXmpuevTWNmDef7TkX07aL7DbwP2A4OB5SCWh6CUp5eXr1itQSuPt3pfklHf9o8xL/kYCkBEigQXRJAPAMYEBI8h1ZkKlEJWAnzTNCstsUh8XkrjqyrKs+FvzmBIXynGXg9uSHPSH0zEMlBAY1xAc/WFWz509ft4qOCUMYbIjdHZKfa4QxsvYYh5uYWGJY4lblKdYFtqJqcLi9fK5NEvq5vx9JGhEjZFW9K17Qbw7t4KkEKpV3', NULL, 'inactive', NULL, NULL),
(13, 1, 'U2FsdGVkX1/4fIVAfszmi7VxCXg96ihYzXUalG/nhhnRh2iYZw+Wr0Niuzr0C3ID6U4lePMNyayYj7wtjfSHQ2hkTqNNV44yDnIQueAErnqUnLG7ER/VpglRQzT6R3mzVSPCPXhvKGut1uvAwmfQELcuivjWtP10StZhlQ7xoawrwxxy8rIZuE2xiWOi4QJRneaVEndbtUGAEUhd9QazKs0pr+DyQ/TEyMsm8WHnzO+l1hAiGb0E0R+q+OfdYrub', NULL, 'inactive', NULL, NULL),
(14, 1, 'U2FsdGVkX1/fehmnV2HYUoldstHnfoqLnfjEEyfbgJCCcmoUZAllIqvDhTS6x4D5ajJGljbDn8A7VMP4AA8PS/V/2GlVCMkGACckXdUtfgkrpIyyA/PCeQRL3S83gFyWZf/kb5KeC9URrpo8om5xq6iIKk1EQf9SO4WxhT7PZLb+8rig1YhbMkj1ZP30+CR18YU2b6Xal8kzcj0y8tja9tg0LiRpNvzIZZHNH5V3NZHI2oO9IjmgbHi8NQ0gUAgd', NULL, 'inactive', NULL, NULL),
(15, 1, 'U2FsdGVkX1/wYDDN5NFGTPJwvZHOmCrZ2kmi+wmd50C73PI9NdZ2eQCmRgb4LObftTi4ZmtlBX+aljpl1PnLQXmgiyqtAIuQDu6W5HrPTjAPNd3U2eOdTQ3Kv9wdQtJzGx0y2BQicDm8TIaBS33MW8rzFqa/hYboDzbQ1wjB/+lBcez3xZHRn0LPmZbjI8bRrySelpoYaBCI3Oa73wWjYnaqTFuZ6Egl9yDVO76LRUo66/hcuaHnBiOwGJwUQq0P', NULL, 'inactive', NULL, NULL),
(16, 1, 'U2FsdGVkX1/H2G+NK3BaQ4BxgOOVFZ+TgaLxChYpM+t8kHxn/Ljuef7WUkxBdfRQtVBHND0pYMxqaEyyLwSuZUsPzTPM0lene8wf7BwuyY/czLGH6jL3XkZ2eFS8MpQ4XjCdHrKsb0PvC0gvAf1itPjWul2fe6FpCFViLy1VHLFIzQMh2JICB6VZDp8AGt85/Z/Vkkco4Gf0b6Pr0n3RRMLaIBOGhSY+5O6+k9MuCQmI2ExCHPNGEZ8U6/xEDHgl', NULL, 'inactive', NULL, NULL),
(17, 1, 'U2FsdGVkX1/wDyxu2vvbeilTlzCk7CnE08TxLpir/myURL1GUeaqrlc4Ui3w/AHkXFMnBBp7L5YJiGHxgv/N89zbkl8BVUHi9M2wBWrPktDZxoV+pQ8cYbhUbygzY+Z4oqPrlmmVepKGjy6VB6Ipaea5UetQd9Yod6i/TVyk9DGeXJQsXVjYEL7TJH0IjML7qAMtAyqi5kWkr0fzVOghfPSxMVrHpdMdIy3cj/oW9AGs4dVB9mzzD+KY7CX74qkv', NULL, 'inactive', NULL, NULL),
(18, 1, 'U2FsdGVkX18/Q/+FH2C4AKsDiDbokr7y18Ac/O1Y8eb5ShixBZ+VswgLZyQPJYpRWtZXRmyOrRCinP3EDCpWBzM5TjtfXE1AkUhPkyiJfepTMk/8MG6o/r/sd8YAdzV308tKjOgstT1jORQgR5mk/6x4sEGeybnpQxacZ8+dAoaHuWrCTVrOTQxHdBwoe5SbNEkrYZl6P04/zoyjBc/SKGkhJOMWPd1urSf9sLyDAkUamAPuszrRwMJGF28S/KQm', NULL, 'inactive', NULL, NULL),
(19, 1, 'U2FsdGVkX19OBbeeHtCFqClPNnOz5n02OJVggJ+7xyAdZE/oPjCXfhugH/I1OiKvh4GzRYaZfKoghcR2enuh80moST+O3QXqLzH5jY2aFG/B6oU8YsWRal5HnpUU/cgoUsbKta0jImSsZXDBXqtUpQr+z6wtO1tYm23kkU86bSjN2uMiqFl5Ox2wuptJP3bAICUgVew1yT/yVeCpYbIA3uYBqm8EklD2NXHIXZjoUFFHKVuMoxwgB92E8KV9myOf', NULL, 'inactive', NULL, NULL),
(20, 1, 'U2FsdGVkX1+B/DIn5FLrDgQBJbjFQ09hDbqTtpiMiujLDR4pPgzWaWwMMUvmtC1mFoDIiI2NSdX2dgfNxPjtUyqfHARkN5A92xsOlwJ5Q3mWCgveKX7+QYGXFhLsCFq6Th3nrIjOnoT4zGHeiAZOmvoeribs8xUqm3qRIkwK1A/OLYf+9U0rthVCHnap0T0uCGgFCpsEENqzopElpC4HbiZ53HwoTKr09Tu9L90wDqN6srpdRH+mxZaDo+DPYR9+', NULL, 'inactive', NULL, NULL),
(21, 1, 'U2FsdGVkX1/GcsuNFiJwk5ouR2cmITQuMKwr2HRaHQ7KbiLJsjSe88zKqKIE6MbKWTkqYJou2mIHLx2BzaSjZIxLFZ3cUnYREr34/wZ3U/1yeatNDriPcsclOfPd72F62inrXhaRy2/sXn9Yx6y/8LlSTvL+hQEvYCMDEb/QSUcqgna+oa88ZsjdMqsVjznOamd62wlDrZOdbhrZCXmLD6XVW2Po5m6yChYK2wnjc2NDfz12eY5mJNusoPiPCqUi', NULL, 'inactive', NULL, NULL),
(22, 1, 'U2FsdGVkX19+Ej3J4uGxDFGT50Y5rWnAlVCYi39lHeHvSX5neAc13xsqo2GwHitibH3LOUhWrIwn7I+T4RQ9JCiEgYY16xlVfqUpxODEFGbRkatHlVa6YcgL6nsGM+YLJtOBFwf07DP0VYdU5HdUYqBC7pu+XPVMDmofe8+A8VGLgAIz9id7DLPRmTDvp5Bfcnsirlpq0lHu39lODEes4iJeKFutbIrxXN8OhAy/za5YVvmK2igx4b48dPbvQY1i', NULL, 'inactive', NULL, NULL),
(23, 1, 'U2FsdGVkX18FbC1JqIjq9+7wyuBqVe33hJ69fyu9XvR1eOy+0+nVDnk9r2bmfc7XbVfLn1Uppy5h019zM7aamLsiAHUAnoSEN/LaofqXAmH0BtbJVvYGat3NJTSyHYINO9B6HKjQGiQzaSfQNjQABQrxmto1oy2R6BMZghGdKErewBP3794pBRKnNQepN3JwmqPrs47JiUVM3SOSXC/DadGF8aL1hGV3/y5cN19qiVLfJwZnzQeFzyUyR33iKTCP', NULL, 'inactive', NULL, NULL),
(24, 1, 'U2FsdGVkX18pFlqd5Ugwx1AaWxjRlSqmUsEf6HsqFwhVofit4/TdPmbxK+7woJar9bvEc/5PvQby38Q4k5HeaEHQoTXmgiicC5ZgHqphh7zYKLr3jP59VNDiC6fe72Yigq7clcZaqO8riIFeZrK6JhrwUwPf5ZPgTZBdgB3HtHQZtjrPxfVwxweok/USbB2HQIRyGXL4FKbJtVJWG1mhQA4gj/k7qRsew+nIJwTpX6G14Gp96yfxJ71EiGIQGJTQ', NULL, 'active', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `Aminities`
--

CREATE TABLE `Aminities` (
  `id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `icon` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `appointments`
--

CREATE TABLE `appointments` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `booking_date` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `amount` bigint(20) DEFAULT NULL,
  `slot_id` bigint(20) DEFAULT NULL,
  `is_combo` tinyint(1) DEFAULT NULL,
  `profesional_id` bigint(20) DEFAULT NULL,
  `razorpay_id` varchar(255) DEFAULT NULL,
  `payment_status` varchar(255) DEFAULT NULL,
  `payment_id` varchar(255) DEFAULT NULL,
  `is_wallet` tinyint(1) DEFAULT NULL,
  `status` enum('booked','cancelled','completed') DEFAULT NULL,
  `is_discounted` tinyint(1) DEFAULT NULL,
  `discounted_amount` bigint(20) DEFAULT NULL,
  `discount_id` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `appointments`
--

INSERT INTO `appointments` (`id`, `user_id`, `store_id`, `booking_date`, `created_at`, `updated_at`, `amount`, `slot_id`, `is_combo`, `profesional_id`, `razorpay_id`, `payment_status`, `payment_id`, `is_wallet`, `status`, `is_discounted`, `discounted_amount`, `discount_id`) VALUES
(1, 2, 1, '2025-06-22 00:00:00', '2025-06-22 16:08:49', '2025-06-22 16:08:49', 320, 2, 0, NULL, 'order_QkDBU7ckjN6XNj', 'sucssess', NULL, 0, 'cancelled', NULL, NULL, NULL),
(2, 2, 1, '2025-06-22 00:00:00', '2025-06-22 16:12:20', '2025-06-22 16:12:20', 220, 2, 0, NULL, 'order_QkDFD56lC7SgkI', 'sucssess', 'pay_QkDFHhI42tcAJt', 0, 'booked', NULL, NULL, NULL),
(3, 2, 1, '2025-06-22 00:00:00', '2025-06-22 22:32:50', '2025-06-22 22:32:50', 220, 2, 0, NULL, 'order_QkJj9E7LruzhLd', 'sucssess', 'pay_QkJjFbTLcNSqot', 0, 'booked', NULL, NULL, NULL),
(4, 1, 1, '2025-06-24 05:30:00', '2025-06-23 14:51:16', '2025-06-23 14:51:16', 350, 1, 1, NULL, NULL, 'pending', NULL, 1, 'cancelled', NULL, NULL, NULL),
(5, 1, 1, '2025-06-23 05:30:00', '2025-06-23 15:25:43', '2025-06-23 15:25:43', 100, 1, 0, NULL, NULL, 'pending', NULL, 1, 'booked', NULL, NULL, NULL),
(6, 1, 1, '2025-06-23 05:30:00', '2025-06-23 15:26:07', '2025-06-23 15:26:07', 100, 1, 0, NULL, NULL, 'pending', NULL, 1, 'booked', NULL, NULL, NULL),
(7, 1, 1, '2025-06-28 05:30:00', '2025-06-23 15:26:52', '2025-06-23 15:26:52', 100, 1, 0, NULL, NULL, 'pending', NULL, 1, 'cancelled', NULL, NULL, NULL),
(8, 1, 1, '2025-06-24 05:30:00', '2025-06-23 15:38:25', '2025-06-23 15:38:25', 250, 1, 1, NULL, NULL, 'pending', NULL, 1, 'cancelled', NULL, NULL, NULL),
(9, 1, 1, '2025-06-29 05:30:00', '2025-06-23 15:51:09', '2025-06-23 15:51:09', 100, 1, 0, NULL, NULL, 'pending', NULL, 1, 'booked', NULL, NULL, NULL),
(10, 1, 1, '2025-06-25 05:30:00', '2025-06-23 15:58:59', '2025-06-23 15:58:59', 470, 1, 1, NULL, NULL, 'pending', NULL, 1, 'booked', NULL, NULL, NULL),
(11, 1, 1, '2025-06-25 05:30:00', '2025-06-23 16:09:42', '2025-06-23 16:09:42', 350, 1, 1, NULL, NULL, 'pending', NULL, 1, 'booked', NULL, NULL, NULL),
(12, 1, 1, '2025-06-28 05:30:00', '2025-06-24 14:48:42', '2025-06-24 14:48:42', 100, 1, 0, NULL, NULL, 'pending', NULL, 1, 'cancelled', NULL, NULL, NULL),
(13, 1, 1, '2025-06-28 00:00:00', '2025-06-28 15:38:00', '2025-06-28 15:38:00', 320, 2, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 1, 256, 2),
(14, 1, 1, '2025-06-28 00:00:00', '2025-06-28 15:41:26', '2025-06-28 15:41:26', 320, 2, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 0, 320, NULL),
(15, 1, 1, '2025-06-28 00:00:00', '2025-06-28 15:41:46', '2025-06-28 15:41:46', 320, 2, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 0, 320, NULL),
(16, 1, 1, '2025-06-28 00:00:00', '2025-06-28 15:42:17', '2025-06-28 15:42:17', 320, 2, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 0, 320, NULL),
(17, 1, 1, '2025-06-28 00:00:00', '2025-06-28 15:58:02', '2025-06-28 15:58:02', 320, 2, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 0, 320, NULL),
(18, 1, 1, '2025-06-28 00:00:00', '2025-06-28 16:02:15', '2025-06-28 16:02:15', 320, 2, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 0, 320, NULL),
(19, 1, 1, '2025-06-28 00:00:00', '2025-06-28 18:21:36', '2025-06-28 18:21:36', 100, 1, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 0, 100, NULL),
(20, 1, 1, '2025-06-28 00:00:00', '2025-06-28 18:33:38', '2025-06-28 18:33:38', 100, 1, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 1, 80, 2),
(21, 1, 1, '2025-06-29 00:00:00', '2025-06-29 12:32:50', '2025-06-29 12:32:50', 100, 1, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 1, 80, 2),
(22, 1, 1, '2025-06-29 00:00:00', '2025-06-29 12:33:49', '2025-06-29 12:33:49', 100, 1, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 0, 100, NULL),
(23, 1, 1, '2025-06-29 00:00:00', '2025-06-29 12:43:43', '2025-06-29 12:43:43', 100, 1, 0, NULL, NULL, 'pending', NULL, 0, 'booked', 1, 80, 2),
(24, 1, 1, '2025-06-29 00:00:00', '2025-06-29 12:47:20', '2025-06-29 12:47:20', 100, 1, 0, NULL, 'order_QmvUVOrDG44d28', 'sucssess', 'pay_QmvUeJFX3xkjdo', 0, 'booked', 1, 80, 2);

-- --------------------------------------------------------

--
-- Table structure for table `appointment_items`
--

CREATE TABLE `appointment_items` (
  `id` int(11) NOT NULL,
  `service_id` bigint(20) DEFAULT NULL,
  `appointment_id` bigint(20) DEFAULT NULL,
  `service_amount` bigint(20) DEFAULT NULL,
  `combo_id` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `appointment_items`
--

INSERT INTO `appointment_items` (`id`, `service_id`, `appointment_id`, `service_amount`, `combo_id`) VALUES
(1, 4, 1, 450, NULL),
(2, 5, 1, 650, NULL),
(3, 4, 2, 450, NULL),
(4, 4, 3, 450, NULL),
(5, 5, 4, 100, NULL),
(6, NULL, 4, 250, 1),
(7, 5, 5, 100, NULL),
(8, 5, 6, 100, NULL),
(9, 5, 7, 100, NULL),
(10, NULL, 8, 250, 1),
(11, 5, 9, 100, NULL),
(12, 4, 10, 220, NULL),
(13, NULL, 10, 250, 1),
(14, 5, 11, 100, NULL),
(15, NULL, 11, 250, 1),
(16, 5, 12, 100, NULL),
(17, 5, 13, 650, NULL),
(18, 4, 13, 450, NULL),
(19, 5, 14, 650, NULL),
(20, 4, 14, 450, NULL),
(21, 5, 15, 650, NULL),
(22, 4, 15, 450, NULL),
(23, 5, 16, 650, NULL),
(24, 4, 16, 450, NULL),
(25, 5, 17, 650, NULL),
(26, 4, 17, 450, NULL),
(27, 5, 18, 650, NULL),
(28, 4, 18, 450, NULL),
(29, 5, 19, 650, NULL),
(30, 5, 20, 650, NULL),
(31, 5, 21, 650, NULL),
(32, 5, 22, 650, NULL),
(33, 5, 23, 650, NULL),
(34, 5, 24, 650, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `Banner`
--

CREATE TABLE `Banner` (
  `id` int(11) NOT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `image` text DEFAULT NULL,
  `date` datetime DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Banner`
--

INSERT INTO `Banner` (`id`, `store_id`, `image`, `date`, `status`) VALUES
(1, 1, '1748450858160-image_cropper_1748450807235.jpg', '2025-06-23 15:11:10', 'active'),
(4, 12, '1750671819310-1331108.jpeg', '2025-06-23 15:13:39', 'active');

-- --------------------------------------------------------

--
-- Table structure for table `category`
--

CREATE TABLE `category` (
  `id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `category`
--

INSERT INTO `category` (`id`, `name`, `status`, `image`) VALUES
(1, 'Saloon', 'active', '1748450858160-image_cropper_1748450807235.jpg'),
(2, 'Saloon & SPA', 'active', '1749901560839-image_cropper_1749901540122.jpg'),
(3, 'Parloaur', 'active', '1749901560839-image_cropper_1749901540122.jpg'),
(4, 'Massage', 'active', '1749901560839-image_cropper_1749901540122.jpg'),
(5, 'Palour', 'active', '1748450858160-image_cropper_1748450807235.jpg');

-- --------------------------------------------------------

--
-- Table structure for table `Combinations`
--

CREATE TABLE `Combinations` (
  `id` int(11) NOT NULL,
  `service_id` bigint(20) DEFAULT NULL,
  `amount_per_service` bigint(20) DEFAULT NULL,
  `combo_id` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Combinations`
--

INSERT INTO `Combinations` (`id`, `service_id`, `amount_per_service`, `combo_id`) VALUES
(2, 4, NULL, 1);

-- --------------------------------------------------------

--
-- Table structure for table `Combo`
--

CREATE TABLE `Combo` (
  `id` int(11) NOT NULL,
  `combo` varchar(255) DEFAULT NULL,
  `amount` bigint(20) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `duration` time DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `service_category` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Combo`
--

INSERT INTO `Combo` (`id`, `combo`, `amount`, `store_id`, `duration`, `status`, `service_category`) VALUES
(1, 'Hair Cut combo', 250, 1, '01:45:00', 'active', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `Coupons`
--

CREATE TABLE `Coupons` (
  `id` int(11) NOT NULL,
  `code` varchar(255) DEFAULT NULL,
  `discount_type` enum('percentage','flat') DEFAULT NULL,
  `usage_limit` int(11) DEFAULT NULL,
  `discount_value` bigint(20) DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `description` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Coupons`
--

INSERT INTO `Coupons` (`id`, `code`, `discount_type`, `usage_limit`, `discount_value`, `start_date`, `end_date`, `status`, `description`) VALUES
(2, 'hello_world', 'percentage', 2, 20, '2025-06-27 05:30:00', '2025-07-08 05:30:00', 'active', 'get 20% off'),
(3, 'dinesh_cutting', 'flat', 2, 50, '2025-06-27 05:30:00', '2025-07-08 05:30:00', 'active', 'get 50 off');

-- --------------------------------------------------------

--
-- Table structure for table `Favourites`
--

CREATE TABLE `Favourites` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Favourites`
--

INSERT INTO `Favourites` (`id`, `user_id`, `store_id`, `status`) VALUES
(1, 2, 1, 'inactive'),
(2, 2, 1, 'active'),
(3, 1, 1, 'active'),
(4, 5, 1, 'active');

-- --------------------------------------------------------

--
-- Table structure for table `NotificationLogs`
--

CREATE TABLE `NotificationLogs` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `NotificationLogs`
--

INSERT INTO `NotificationLogs` (`id`, `user_id`, `title`, `description`, `image`, `status`, `date`) VALUES
(1, 2, 'Order Confirmed', 'Your Booking with Dhiyaa beauty parlour has been confirmed', '[\"1750530021682-image_cropper_1750530008413.jpg\",\"1750530021877-image_cropper_1750530009219.jpg\",\"1750530022025-image_cropper_1750530009802.jpg\",\"1750530022132-image_cropper_1750530010788.jpg\"]', 'active', '2025-06-22 16:09:14'),
(2, 2, 'Order Confirmed', 'Your Booking with Dhiyaa beauty parlour has been confirmed', '[\"1750530021682-image_cropper_1750530008413.jpg\",\"1750530021877-image_cropper_1750530009219.jpg\",\"1750530022025-image_cropper_1750530009802.jpg\",\"1750530022132-image_cropper_1750530010788.jpg\"]', 'active', '2025-06-22 16:12:29'),
(3, 2, 'Order Confirmed', 'Your Booking with Dhiyaa beauty parlour has been confirmed', '[\"1750611245940-1750611236220-1750530021682-image_cropper_1750530008413.jpg\",\"1750611246025-1750611236278-1750530021877-image_cropper_1750530009219.jpg\",\"1750611246062-1750611236301-1750530022025-image_cropper_1750530009802.jpg\"]', 'active', '2025-06-22 22:33:03'),
(4, 1, 'Order Confirmed', 'Your Booking with Dhiyaa beauty parlour has been confirmed', '[\"1750611245940-1750611236220-1750530021682-image_cropper_1750530008413.jpg\",\"1750611246025-1750611236278-1750530021877-image_cropper_1750530009219.jpg\",\"1750611246062-1750611236301-1750530022025-image_cropper_1750530009802.jpg\"]', 'active', '2025-06-23 18:56:41'),
(5, 1, 'Order Confirmed', 'Your Booking with Dhiyaa beauty parlour has been confirmed', '[\"1750611245940-1750611236220-1750530021682-image_cropper_1750530008413.jpg\",\"1750611246025-1750611236278-1750530021877-image_cropper_1750530009219.jpg\",\"1750611246062-1750611236301-1750530022025-image_cropper_1750530009802.jpg\"]', 'active', '2025-06-23 18:57:30'),
(6, 1, 'Order Confirmed', 'Your Booking with Dhiyaa beauty parlour has been confirmed', '[\"1750611245940-1750611236220-1750530021682-image_cropper_1750530008413.jpg\",\"1750611246025-1750611236278-1750530021877-image_cropper_1750530009219.jpg\",\"1750611246062-1750611236301-1750530022025-image_cropper_1750530009802.jpg\"]', 'active', '2025-06-23 18:57:56'),
(10, 1, 'Order Confirmed', 'Your Booking with Dhiyaa beauty parlour v has been confirmed', '[\"1747932155353-man.jpg\"]', 'active', '2025-06-29 12:47:36');

-- --------------------------------------------------------

--
-- Table structure for table `OwnerProfile`
--

CREATE TABLE `OwnerProfile` (
  `id` int(11) NOT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` bigint(20) DEFAULT NULL,
  `profile_pic` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `country_code` varchar(255) DEFAULT NULL,
  `Dob` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `OwnerProfile`
--

INSERT INTO `OwnerProfile` (`id`, `store_id`, `name`, `email`, `phone`, `profile_pic`, `country`, `country_code`, `Dob`) VALUES
(1, 1, 'Dhineshkumar ', 'Dhineshbabu9025@gmail.com', 9025821501, '1750528736147-image_cropper_1750528730412.jpg', 'India', '+91', '24-Mar-2001'),
(2, 12, 'Naturals ', 'Natural@gmail.com', 9025821501, NULL, 'India', '+91', '24-Feb-2002');

-- --------------------------------------------------------

--
-- Table structure for table `PartnerAddress`
--

CREATE TABLE `PartnerAddress` (
  `id` int(11) NOT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `addressLine1` longtext DEFAULT NULL,
  `addressLine2` longtext DEFAULT NULL,
  `district` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `zipcode` bigint(20) DEFAULT NULL,
  `landmark` varchar(255) DEFAULT NULL,
  `latitude` varchar(255) DEFAULT NULL,
  `longitude` varchar(255) DEFAULT NULL,
  `location` point NOT NULL,
  `radius` bigint(20) DEFAULT 3000,
  `status` enum('active','inactive') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `PartnerAddress`
--

INSERT INTO `PartnerAddress` (`id`, `store_id`, `addressLine1`, `addressLine2`, `district`, `city`, `zipcode`, `landmark`, `latitude`, `longitude`, `location`, `radius`, `status`) VALUES
(1, 1, 'madhav,ramnagar', 'eorde, thindal', 'Erode', 'Palayapalayam', 638004, NULL, '11.3587875', '77.7770938', 0x000000000101000000293ba2e7bb7153405d6dc5feb2b72640, 20000, 'active'),
(13, 12, 'Ground Floor', 'Vivekananda Road', 'Erode', 'Erode Tamil Nadu', 638011, NULL, '11.3438341', '77.702134', 0x00000000010100000038da71c3ef6c5340cb7fed050bb02640, 3000, 'active'),
(14, 12, 'Ground Floor', 'Vivekananda Road', 'Erode', 'Erode Tamil Nadu', 638011, NULL, '11.3438341', '77.702134', 0x00000000010100000038da71c3ef6c5340cb7fed050bb02640, 3000, 'active');

-- --------------------------------------------------------

--
-- Table structure for table `PartnerNotificationLogs`
--

CREATE TABLE `PartnerNotificationLogs` (
  `id` int(11) NOT NULL,
  `partner_id` int(11) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `PartnerNotificationLogs`
--

INSERT INTO `PartnerNotificationLogs` (`id`, `partner_id`, `title`, `description`, `image`, `status`, `date`) VALUES
(3, 1, 'Order Confirmed', 'Your Got a new Booking from dinesh srinivasan', '1750663115762-0MP_5923.JPG', 'active', '2025-06-23 18:57:56'),
(4, 1, 'welocome to the store', 'Hello World !', '1750611245940-1750611236220-1750530021682-image_cropper_1750530008413.jpg', 'active', '2025-06-25 16:20:21'),
(5, 2, 'welocome to the store', 'Hello World !', '1750657885427-1.png', 'active', '2025-06-25 16:25:42'),
(6, 2, 'welocome to the store', 'Hello World !', '1750657885427-1.png', 'active', '2025-06-25 16:26:22'),
(7, 2, 'welocome to the store', 'Hello World !', '1750657885427-1.png', 'active', '2025-06-25 16:29:46'),
(8, 2, 'welocome to the store', 'Hello World !', '1750657885427-1.png', 'active', '2025-06-25 17:02:39'),
(9, 2, 'welocome to the store', 'Hello World !', '1750657885427-1.png', 'active', '2025-06-25 17:03:09'),
(10, 2, 'welocome to the store', 'Hello World !', '1750657885427-1.png', 'active', '2025-06-25 17:06:54'),
(11, 1, 'welocome to the store', 'Hello World !', '1750867204675-1750663115762-0MP_5923.JPG', 'active', '2025-06-26 21:23:14'),
(12, 2, 'welocome to the store', 'Hello World !', '1750657885427-1.png', 'active', '2025-06-26 21:23:14'),
(13, 1, 'Order Confirmed', 'Your Got a new Booking from Madhav srinivasan', '1750867204675-1750663115762-0MP_5923.JPG', 'active', '2025-06-29 12:47:40');

-- --------------------------------------------------------

--
-- Table structure for table `Payments`
--

CREATE TABLE `Payments` (
  `id` int(11) NOT NULL,
  `payment_status` enum('pending','success','failed') DEFAULT NULL,
  `appointment_id` bigint(20) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `refund_requests`
--

CREATE TABLE `refund_requests` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `appointment_id` bigint(20) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT NULL,
  `is_wallet` tinyint(1) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `refund_requests`
--

INSERT INTO `refund_requests` (`id`, `user_id`, `appointment_id`, `reason`, `status`, `is_wallet`, `created_at`) VALUES
(1, 1, 4, 'sfdf', 'pending', 1, '2025-06-23 14:55:07'),
(2, 1, 7, 'cf', 'pending', 1, '2025-06-23 15:33:45'),
(3, 1, 8, 'sss', 'pending', 1, '2025-06-23 15:38:41'),
(4, 1, 12, 'ffgd', 'pending', 1, '2025-06-24 14:49:03');

-- --------------------------------------------------------

--
-- Table structure for table `Reviews`
--

CREATE TABLE `Reviews` (
  `id` int(11) NOT NULL,
  `rating` int(11) DEFAULT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `cretaed_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `review_description` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Reviews`
--

INSERT INTO `Reviews` (`id`, `rating`, `user_id`, `store_id`, `cretaed_at`, `updated_at`, `review_description`, `status`) VALUES
(1, 4, 2, 1, '2025-06-22 22:35:17', '2025-06-22 22:35:17', 'Good saloon', 'inactive');

-- --------------------------------------------------------

--
-- Table structure for table `review_delete_requests`
--

CREATE TABLE `review_delete_requests` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `review_id` bigint(20) DEFAULT NULL,
  `reason` longtext DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `review_delete_requests`
--

INSERT INTO `review_delete_requests` (`id`, `user_id`, `store_id`, `review_id`, `reason`, `status`) VALUES
(2, 2, 1, 1, 'it is a fake review', 'approved');

-- --------------------------------------------------------

--
-- Table structure for table `Servicecategory`
--

CREATE TABLE `Servicecategory` (
  `id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Servicecategory`
--

INSERT INTO `Servicecategory` (`id`, `name`) VALUES
(1, 'Mens Packages'),
(2, 'Combo Offers'),
(3, 'MakeUp Packages'),
(4, 'Hair Color Packages');

-- --------------------------------------------------------

--
-- Table structure for table `SettlementLogs`
--

CREATE TABLE `SettlementLogs` (
  `id` int(11) NOT NULL,
  `amount_paid` bigint(20) DEFAULT NULL,
  `wallet_pending` bigint(20) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `transaction_date` datetime DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Slots`
--

CREATE TABLE `Slots` (
  `id` int(11) NOT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `from` time DEFAULT NULL,
  `to` time DEFAULT NULL,
  `notes` longtext DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Slots`
--

INSERT INTO `Slots` (`id`, `store_id`, `from`, `to`, `notes`, `status`) VALUES
(1, 1, '09:30:00', '21:30:00', '', 'active'),
(2, 1, '20:30:00', '18:30:00', '', 'active');

-- --------------------------------------------------------

--
-- Table structure for table `Store`
--

CREATE TABLE `Store` (
  `id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `store_type` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `images` longtext DEFAULT NULL,
  `team_size` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `address_id` bigint(20) DEFAULT NULL,
  `created_at` bigint(20) DEFAULT 1750522677435,
  `docs` longtext DEFAULT NULL,
  `income` varchar(255) DEFAULT NULL,
  `bank_account_holder` varchar(255) DEFAULT NULL,
  `account_number` varchar(255) DEFAULT NULL,
  `ifsc_code` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive','terminated') DEFAULT NULL,
  `category_id` bigint(20) DEFAULT NULL,
  `phone` bigint(20) DEFAULT NULL,
  `wallet_remaining` bigint(20) DEFAULT 0,
  `description` longtext DEFAULT NULL,
  `deviceId` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Store`
--

INSERT INTO `Store` (`id`, `name`, `store_type`, `website`, `images`, `team_size`, `email`, `password`, `address_id`, `created_at`, `docs`, `income`, `bank_account_holder`, `account_number`, `ifsc_code`, `status`, `category_id`, `phone`, `wallet_remaining`, `description`, `deviceId`) VALUES
(1, 'Dhiyaa beauty parlour v', 'Unisex', '', '[\"1747932155353-man.jpg\"]', NULL, 'dhineshbabu9025@gmail.com', '$2b$10$I7FVJYdgyvFfz4Xy8KftzukUqaWxenledM.lVNjdEt6htlG1pV6RC', 1, 1750525105395, '\"1751096501202-1751096419880-1751096371356-1751096106404-1751096075516-1750854942641-Dummy pdf.pdf\"', '3 to 5 Lakh', 'Dhineshkumar R', '18480110092743', 'UCBA001848', 'active', 4, NULL, 1300, 'Good saloon', '[\"e7qlZbjpThqb9pmn60113k:APA91bHEe4H0wR4vJuoBhfgeD5Esdqv6xkFpatSQeC9oFof4AmL3GOJPx-44M-jJAUU9At6MfKI0iILJXFnPVrTN-lSSMRugG7Mon06kmflnG-JTG8tEFME\"]'),
(3, NULL, NULL, NULL, NULL, NULL, 'madhavasrinivasan44@gmail.com', '$2b$10$14tS12kt3tNXU8yH9Kx8iugthiY6QYmFLS9Gv6HvSe/vF7vzcqSPG', NULL, 1750588814778, NULL, NULL, NULL, NULL, NULL, 'inactive', NULL, NULL, 0, NULL, NULL),
(4, NULL, NULL, NULL, NULL, NULL, 'dhineshbabu9025@gmail.comb', '$2b$10$70Zn4IxYjO80gxvuwEYR.OHkYO1/PUdoU/H2hKnAMIx.myUQ//VZK', NULL, 1751100656976, NULL, NULL, NULL, NULL, NULL, 'inactive', NULL, NULL, 0, NULL, NULL),
(12, 'Naturals erode', 'Unisex', '', '[\"1751114176015-1751113604579-image_cropper_1751113433800.jpg\",\"1751114176074-1751113604622-image_cropper_1751113434780.jpg\"]', NULL, 'Dhinesh@gmail.com', '$2b$10$347A7zxgKdXX4TqmcktMGugqHQoytf8Umy5ZI9Xn0OBUjLhN39Bfm', 14, 1751111015307, '\"1751114176075-1751113604696-Dummy pdf.pdf\"', '5 to 10 Lakh', NULL, NULL, NULL, 'terminated', 3, NULL, 0, 'A salon typically refers to a place where beauty or fashion services are offered, such as a hair salon or a beauty salon. It can also refer to a reception hall or a gathering of notable people. A saloon, on the other hand, usually means a bar or pub, especially in the historical context of the American West. It can also refer to a large cabin on a ship or the passenger area of a car.', '[\"fp0RJsejTUq_N_vtxfwFd7:APA91bHsyTFVzUR9_UiV47jKkKvBFlCxnTCo493dY5AG-zssSX36N4FOsxnHzEWiR-8EHIE6eyn9Vl7RHo5KxEe-nXy1V5eI8PkHXzIJQuN3XpmGKWF5x4g\"]');

-- --------------------------------------------------------

--
-- Table structure for table `StoreAminities`
--

CREATE TABLE `StoreAminities` (
  `id` int(11) NOT NULL,
  `aminities_id` bigint(20) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `StoreAminities`
--

INSERT INTO `StoreAminities` (`id`, `aminities_id`, `store_id`) VALUES
(1, 2, 1),
(2, 5, 1),
(3, 6, 1);

-- --------------------------------------------------------

--
-- Table structure for table `StoreServices`
--

CREATE TABLE `StoreServices` (
  `id` int(11) NOT NULL,
  `service_name` varchar(255) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `amount` bigint(20) DEFAULT NULL,
  `discounted_amount` bigint(20) DEFAULT NULL,
  `duration` time DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `service_category` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `StoreServices`
--

INSERT INTO `StoreServices` (`id`, `service_name`, `store_id`, `amount`, `discounted_amount`, `duration`, `status`, `service_category`) VALUES
(1, 'SPA', 1, 250, 50, '00:30:00', 'inactive', NULL),
(2, 'SPA', 1, 260, 60, '00:30:00', 'inactive', 1),
(3, 'SPA', 1, 250, 100, '00:45:00', 'inactive', NULL),
(4, 'SPA MASSAGE', 1, 450, 220, '00:45:00', 'active', 1),
(5, 'MAKE UP', 1, 650, 100, '01:00:00', 'active', 3);

-- --------------------------------------------------------

--
-- Table structure for table `StoreSession`
--

CREATE TABLE `StoreSession` (
  `id` int(11) NOT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `token` varchar(255) DEFAULT NULL,
  `ipv4` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `userAgent` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `StoreSession`
--

INSERT INTO `StoreSession` (`id`, `store_id`, `token`, `ipv4`, `status`, `created_at`, `updated_at`, `userAgent`) VALUES
(1, NULL, 'U2FsdGVkX19jaaznjOEadgrcHROKIhAqJaGWO7WYEbGsOewxi1Cp61xlcvDJBMxXNVE8VP/WqbvqQH5FWF2TnN42IGnjSs2Zs5dL0HgLgVjK2xrNLJxPImd67V6N/wRdeqcXBRsI5/ILXw1CJ5u9sU8QoOlkISG4Psdt3x4zsgpC3nDbtNc+6swgL0E1jaWKjoNE1gHTLlzsvCv5AN8ZsA==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(2, NULL, 'U2FsdGVkX1+CKXXq3uQIvGYt3WoqwQTpYVT9YFw6lQYuXnrvzsfZTZiHJZtidoex3qHJFJYsAgLm0SvqSbooMqAP5UYqQwzISS8SqqNQL0V7XaF3UiR803AmLp+324IXqhXI9eoGE8kbbctpTL952xpDXrIy93rRvadVOZvxi5RdMz6Fjj7117Qnyd/4u4kDNkw+663lpZ87D7mR8UOxsQ==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(3, NULL, 'U2FsdGVkX19D+Y2HFuIo0/YSFIVkVpw67QfMqHvqPNwK2N0b0otlRMuZ3L3GW4jjs1/vMSQj9c7/mMaVPskYA6ZZR0xBLCv7mmzyvavIATP562Oo0NW5DDD2PS9HLoUYiuyP8aJH6cVZRjN+FoZjAu9v0wLxIOmtZrmod146sonMr1j0qf95cOe2nW8iV7sbYJq166W3xHQD6NsEgqa6eA==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(4, NULL, 'U2FsdGVkX18mvRYrbrz1MoiKk95VIxV7an6oxkqnBJ66DvWRbPt+ylLBsNV9T4iWQBL0jebpw1mCf9W/X+VNcnZDHlsYAwacEwRCevk+5IthIifogR0vr5KRtdDLjl+6VMNoVz4jzB4ZkiARsXRMZvTiB8cr+JpwVaEJL3PpJ5Q54Vt/ND1zFN2RSpmsi8/pbDjhiGpE+9z4fGULCr7BBw==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(5, NULL, 'U2FsdGVkX19NzI+umFjKWCx0gqYJqjW376qnqu4Hy5+HLhmTn29MyLkpwpHfoAAG6+KK4+0QXhNUge/HAm1l2CLAf0Q2pNmL1k9plzYjJOhUUF60PzdjZ8rbOLcGbrElVgpeEr/esKaJEH2SScc8ywNq7OEq3+FBWt8hNNi7qXYYr+Q89fTMJjNF2BHzVxE6wJlseae/XVDVm/eQgLtCuA==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(6, NULL, 'U2FsdGVkX1+xP0bjb1fK04WLpI2deMtwIYvAnPFoRo9yFB8K8vO66J20r9ekw3zS6lz5j6UirrwkcbhsP8dfNwtT62Kga5yqvku+UExBYUtkespUiRPApzuygRwOGp1onOKISo6wbtrvNK8/2kSBXzSc7kiB2QbktD+5J9rz0BpJBTl9vwzIHpol5F5XySHYVwFzRxwhKbBVxFfEczwsOQ==', NULL, 'active', NULL, NULL, 'EchoapiRuntime/1.1.0'),
(7, NULL, 'U2FsdGVkX18IQx/pilAjs6uNq2aHU9vWEVT5QIzCg0RDQIA8OUmP01krSFsPiieZPBZsOs5eyUngXG6d/fVPc5HqGE6gXizzIruJn/Xq9ZILG5uMk+gyLWH/weqTod1xXbqUFu7XanyWXZj9+yYDkIDd9tfDfG30rym/yxKOc3f+tD1YbkaeOaGkt0HA4/mNqjh1vrlbyTghfXklU5yeFg==', NULL, 'active', NULL, NULL, 'EchoapiRuntime/1.1.0'),
(8, NULL, 'U2FsdGVkX1/rk7mxKDHhB4huVxbn1Y+/oBEfM8U+/uL6Ve/508w2N4D34px7h44owmrtu1FhKPat8Aj+EwEcgM9hRggPL7/EJ6GZDSLvnkpRCBNgXdUTim6fmLRnInKxmqUSDyFAeBh5DRE5qRpZH7SdYuqAC9IyjdKJY7NfDae33PucnNuxPNTQhQ1Lnq+3dVPmtI6dkfYLh8UvR/m34w==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(9, NULL, 'U2FsdGVkX1+0OB8OKEErn2SiFR2B8elPInG/qPUbYzJEzqMqI0pgmIBilHuq6h2ybPJl/Tm2sGc+CspkiKGYWlvGYg1S9JfgUCaxdAkROrjicAkbhHxj/aPnEei/q5ynCZzOBMRpwnR5aAy5itUJR4PK8F30FTV0MMO72+0AtGAYcAFJ3+0weL2dnobd473wNWbBafk1Wxn8rrNW2zS2Gw==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(10, NULL, 'U2FsdGVkX19Zc0k5TqqYRtxRasad1rioe3RP84b5e/0b2YEaqS3u3uFIIJJ5ykaYJS0Rpe0mmDvTBAzpWmDK/Xi65zPaonjIEyq9TFBRuV13IsYtoHqmf4bhsH5FBO+3tjXdq3G01QdCDwa3OlCJC63QTxm/NHPLdq4SJYLWGYqnAvJgw7yXW1/FKYLGU3VWCeyOsPRV1sGzOfn5VDh9UA==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(11, NULL, 'U2FsdGVkX18dm2BpnlLjjuKM5vrQg/Bp0GByJUDxOfPoDaJwkIYBFLlH+xdgAhCbg6G5g9ScPneQtSMAucysCDU6QC+Q0PmYBfjUzr0iIvx0cQN4WG+7oPn1FMPhfK3onCvO8JPZ6EXIUTt1uEBGzqegkDT4KRzAmyyxIHUxLzrL7/kLfVxCwcKER0goqOoqvKuE5sPw0T/h6L9yhbMCYg==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(12, NULL, 'U2FsdGVkX191myXUshhovck0t3YG53AWVaOwzMTAd5qD6fgjUgvXp4zSMzsIHRVUcatWDvdhBen+TUumJ1wZjGdXpV5WVFX9zFjRtr+dgXesejBKfc1BUMup8fA3/dCbFfKLL/Q22f4/QIRUSI791TYeXnlOnhLW+WCcnBc1Z2M8chlGzKo0viFUKIE12OvbbZBoDfiFfV92ELurjrSKSQ==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(13, NULL, 'U2FsdGVkX1/gQTnQZq6DY/T4SPK9Sc2sZu/CQhPm71/Qmos/a7o8AX/77HBGD7KS8UeKUpc3QWCpNl42Z6qPrLxfUSot96+3mJyvBgE0ifylzuofE9SNEg8r/Lz+GgENA4RTJraFjN/Bz26K5l6EU8XQZMqYQES67n4SZ+zyFea/c6bbo4+mHHTUfNCv8yWo7kXZtok5iTEim8/ftVFAcA==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(14, NULL, 'U2FsdGVkX19fZT3jj/R0KwhCnUI+EqLUTZ2pvQF4VvZdwaCd3dYybDOTO481CxwszIdzeTOLFhhwyqtfDWetm6IL5HM8huNUBKyPAWI1pAgW+qbSDRH8kt2FfxNSD9dwapGXXFB3GPqO0b900zl12n5DutG8rFdjmkhme8aBKnB16fZI/M4MbzGugUIgeNHXAAo54s97zYWm7ldGdI190A==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(15, NULL, 'U2FsdGVkX1+InCYItq/kMMNBm0eacJBPzDF4HHd+/+35BfGW38BWVWqOCy4BfkjCgW99mgoWzYgi2leikhAlP2lPShFoSqomWSqckY4fnTOl1f53JnnxfOUoNYEBJOfpLDyFnJSlGuDJMvsYZZf/QHlO33qSOw5qcBf1J6pfseThk3vM03YHTBsUMqQ8mNp4L2V5SSGqXbzpJ3DH/2nDZg==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)'),
(16, NULL, 'U2FsdGVkX1/pxK9aSFYKOEVp7Q+HQf7N7We8751VtowJ6ss+ureGSITh3ceNvTexeW1jPU6g5oZ6MqknbKmVQT8+9heetUEhFudNMwSLlx7O4IXMiCm49BmHGwgJUeIT1kE4P46fuZqORZFSQNdz9W2WmB/zn8WhBo522T6RfkjaRrG4iSg8CUXSqiX0/eyiTk/O2EmABp4KaaQfYa7xtw==', NULL, 'active', NULL, NULL, 'Dart/3.6 (dart:io)');

-- --------------------------------------------------------

--
-- Table structure for table `StoreSubscription`
--

CREATE TABLE `StoreSubscription` (
  `id` int(11) NOT NULL,
  `subscription_id` bigint(20) DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `amount` bigint(20) DEFAULT NULL,
  `quantity` bigint(20) DEFAULT NULL,
  `paymet_status` enum('pending','completed','failed') DEFAULT NULL,
  `payment_id` varchar(255) DEFAULT NULL,
  `order_id` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `type` enum('range','chairs','banner','notification') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `StoreWallet`
--

CREATE TABLE `StoreWallet` (
  `id` int(11) NOT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `wallet` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Stylist`
--

CREATE TABLE `Stylist` (
  `id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `profilepic` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address` longtext DEFAULT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `known_services` varchar(255) DEFAULT NULL,
  `designation` varchar(255) DEFAULT NULL,
  `employment_id` varchar(255) DEFAULT NULL,
  `phone` bigint(20) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `Stylist`
--

INSERT INTO `Stylist` (`id`, `name`, `store_id`, `profilepic`, `email`, `address`, `gender`, `known_services`, `designation`, `employment_id`, `phone`, `country`, `status`) VALUES
(1, 'Dhineshkumar ', 1, '1750585830270-1750585722238-image_cropper_1750585717858.jpg', 'THSOIS777', '56 tajnagar', 'Male', '[4]', 'Designation ', 'THSOIS777', NULL, 'India', 'active'),
(2, 'Sheela r', 1, '1750611141031-image_cropper_1750611134828.jpg', 'TYHFF87666BB', 'Tajnagar ', 'Male', '[4]', 'Good guys', 'TYHFF87666BB', NULL, 'India', 'active');

-- --------------------------------------------------------

--
-- Table structure for table `SubscriptionPlans`
--

CREATE TABLE `SubscriptionPlans` (
  `id` int(11) NOT NULL,
  `type` enum('range','chairs','banner','notification') DEFAULT NULL,
  `days` int(11) DEFAULT NULL,
  `price` bigint(20) DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `SubscriptionPlans`
--

INSERT INTO `SubscriptionPlans` (`id`, `type`, `days`, `price`, `status`, `created_at`) VALUES
(1, 'chairs', 40, 30, 'active', '2025-06-26 18:00:04');

-- --------------------------------------------------------

--
-- Table structure for table `UsedCoupons`
--

CREATE TABLE `UsedCoupons` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `coupon_id` bigint(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `User`
--

CREATE TABLE `User` (
  `id` bigint(20) NOT NULL,
  `firstname` varchar(255) DEFAULT NULL,
  `lastname` varchar(255) DEFAULT NULL,
  `phone` bigint(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `otp` int(11) DEFAULT NULL,
  `optExpiration` datetime DEFAULT NULL,
  `date_of_birth` varchar(225) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `invited_code` varchar(255) DEFAULT NULL,
  `used_code` varchar(255) DEFAULT NULL,
  `wallet` decimal(19,4) DEFAULT 0.0000,
  `profilePic` varchar(255) DEFAULT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `device_id` longtext DEFAULT NULL,
  `status` enum('active','inactive','terminated') NOT NULL DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `User`
--

INSERT INTO `User` (`id`, `firstname`, `lastname`, `phone`, `email`, `otp`, `optExpiration`, `date_of_birth`, `city`, `invited_code`, `used_code`, `wallet`, `profilePic`, `gender`, `country`, `device_id`, `status`) VALUES
(1, 'Madhav', 'srinivasan', 9876543210, 'madhavasrinivasan44@gmail.com', 0, '1970-01-01 05:30:00', NULL, NULL, NULL, NULL, 1080.0000, '1750867204675-1750663115762-0MP_5923.JPG', 'Male', 'India', '[\"eyMOTxCsQFGCjYqAYwHia1:APA91bH_fXr2ZMP0VoeMcjBWCp_5C27SQHugyWclBkThv8KZt8U38WC2EWoVwMCyj7QD6WJzlAd3r02N0cRA8bnpqehs2pKEARsKPOlzyJ1WJckKmvcjmVY\",\"e80nJ5JaT7KSoN6d4QyV6B:APA91bEE-WRarDgpN38-_M1J5eBOcwVkzHK5-_ToAt3qyWQ6QaGczNYPiMkNL6vN1m321_v56sPFVx0M23Wm2hjCFI2MY0lhs6JMeyrgki3viWvM0baXV68\",\"dQ73jtbDT7qnOv5PqRTF2C:APA91bG3waremAL_aCb7wEPUkGy27uT2Kf_W9ijJU_bkQWGPzQGKUKVDQD4eDAZ-LaAwPZhFqDoBWnMvybbpZcm9CeWQY6lIY1TuUodLmmxQCwK6NjiWvXk\",\"fnWGxv9mR7SKs5utcDlN8X:APA91bFxpAsZFFTjZI5vAKc30uHWusvwYJqxjuGM4TqbVqtsfeRLLY6att7z841ZjOIqhSdLCeA5ikctPDXoUBzu21NLOK3vSaZofni0Of1WLIc5VYzm4Hc\",\"cQClinxyROS5TODUiT4JFV:APA91bE-dnNQ_kXfGw6nNDeQDm6ffyGpB_9yv3P_M8LR7nXF_ZUgAY_N4bBGKeQXA5IH-w0GH02rKM4nd0zYTO4UfHx-7x8CoSPb7RGJzstaKrOkCwbi1NU\"]', 'inactive'),
(4, NULL, NULL, 9626956227, NULL, NULL, '2025-06-26 10:45:19', NULL, NULL, NULL, NULL, 0.0000, NULL, NULL, NULL, NULL, 'active'),
(5, 'Dhineshkumar', 'R', 9025821501, 'dhineshbabu9025@gmail.com', 0, '1970-01-01 05:30:00', '24-Mar-2001', NULL, '902591501', NULL, 0.0000, '1751183452631-image_cropper_1751183449947.jpg', 'Male', 'India', '[\"cQClinxyROS5TODUiT4JFV:APA91bE-dnNQ_kXfGw6nNDeQDm6ffyGpB_9yv3P_M8LR7nXF_ZUgAY_N4bBGKeQXA5IH-w0GH02rKM4nd0zYTO4UfHx-7x8CoSPb7RGJzstaKrOkCwbi1NU\"]', 'active'),
(6, NULL, NULL, 9876543211, NULL, 0, '1970-01-01 05:30:00', NULL, NULL, 'p619195211', NULL, 0.0000, NULL, NULL, NULL, NULL, 'active'),
(7, NULL, NULL, 8056880490, NULL, 0, '1970-01-01 05:30:00', NULL, NULL, 'p072257490', NULL, 0.0000, NULL, NULL, NULL, NULL, 'active');

-- --------------------------------------------------------

--
-- Table structure for table `UserSession`
--

CREATE TABLE `UserSession` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `token` varchar(255) DEFAULT NULL,
  `ipv4` varchar(255) DEFAULT NULL,
  `status` enum('active','expired','revoked') DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `UserSession`
--

INSERT INTO `UserSession` (`id`, `user_id`, `token`, `ipv4`, `status`, `created_at`, `updated_at`) VALUES
(1, 1, 'U2FsdGVkX1/RZUQgfOVPo5kTWDhyfttvWESbMyaKG8uTefvEhxx7l/DboyfXqjV5Qfdq0L7IgSfIot1OyLsFk/xX4tkZgvSgPPHXGOwhMiKdtTQPZwU4DSrZmXPw67xNdI1XbJYbCI9vXOwTJizRMhvYZnxJvnkh3J3aEE2p9Wm2aqv8UaixL6eHkHvZnq0l4QD6+viOxTi2iFrkQgRGL+gztmHOBa96cbGUpwFA0Ck=', '::1', 'active', NULL, NULL),
(2, 2, 'U2FsdGVkX1+RneIfSC1kiV87e4ZmNJG7Y25jUPp34nMp6NcoFBuMOQM98d3bySWeFaEEeokg8D6k2EgWk409uUoXG77ZWAQuc0Abn3dJVXFpbJoJbexW20oRwFNvVuqXduP5Jh30GFYUNfzUXklYGGTPz9BbzePWbTCFvMyqTK0rkqs0/Y/zyZCL55pKxEIiYNO9RV2huJ9ClA6w5h0XXsWVDMmKHDwdth8xCIV5Re0=', '127.0.0.1', 'active', NULL, NULL),
(3, 2, 'U2FsdGVkX19YcbUkv5Ku9GKScn82kS++jkAUyfBGP7oduy34/IvYS5XCyreZTErx6iDeVp0kd5DbaiDj6fX0JsZNhMj1IGeDH6X8Bc6KtEv5ZRsYptlZy8Ou0nQrCphZU31Qhsqq9d0i69V3TBcMdW+XC5u+iWEfOwPbX5LX4Ix/lPVixdMjlKI5Hv3rkd7co9xTgMQB/G+ojeU40J5igCu5ryXHor5kxmWno9zukzk=', '127.0.0.1', 'active', NULL, NULL),
(4, 2, 'U2FsdGVkX184/2xuLjpdpqDgiFura6gWwfmBGIWDYal2rG/aCx+9nhoqEO8Z6BUkqPokR40g8ojlEMf8nePhlgUOxLzHsVUUPo7Id6EaTgS3rJyi941LvfasuDbqy40xmlNtceow210xCaDuO0jE/Z+YxSmP75HjlQmOdn9cIVyVnPoJZzoTldImf6mYx/amIdz4z3hlllPXxk+f2U2hePToz6QvrutyKHrHvC9289s=', '127.0.0.1', 'active', NULL, NULL),
(5, 2, 'U2FsdGVkX18x4eKYPVHCE+f4vcufNUZO00HGkbnwRKoPPp0nzzIpEWnMtfwkYGgz8EXgmIfuie+m2H79EU0fWGfHHf/Hdc6MdFkIBDp+FGkM8Dwu1IoNbASfE9J765Zf4mIRhFF+AgzBSro56lyx2+3QWRl1sXqd1YQBL4BvJZXmGpSyPTiIHrcx2/cwd9lPA6LCxbCCtaJNMn/cEFVvormP1mUaz52F4/Gk+8TvilU=', '127.0.0.1', 'active', NULL, NULL),
(6, 2, 'U2FsdGVkX1/xMYCWT517qBFLA3pSNypSbiF1BP1prIqTgd4V6PW/tw/ypVzIJubL1EttYayQFrO/pWyv+DI+KMpxxCrHs5ggW+15nkXKRlclsBgHqFl+1A7HWoAt8Aeuu6mWqu5/M1GA7PhFFlpUpjAOn19gVtNw4NWsprr67G6nisO450QfJzipb6C7SHHR3MocTfw2maAPARhHPitlRJ6si12kaXbtsHD9bkC0Cc8=', '127.0.0.1', 'active', NULL, NULL),
(7, 2, 'U2FsdGVkX18b7+ZR8W/oBtyKDyfPPIVyBtHAcxRH3dQO8HyYjYfhHziTc+1gDmlaBF8sk42zwTeZ3RfuDAS7qtyY0YNgFKt5cFaIh+HTwSAOYQ2cLU8ip9WNRcBT2OY6OBNPCDNZOqiFpK06lTf+20gWRW4v+fm+uiQKF2u5aPwjP42ftfEPDvQ23nlMd+W0PvDV9nks4+mY9AZ+uKRUYaSJ4R2tQjKVOpPJhTT17Cs=', '127.0.0.1', 'active', NULL, NULL),
(8, 1, 'U2FsdGVkX1/JpqEXHEfHVZl5XAGi7BbzaRrOZohYId7LzaMheYw3D5+A3OekKLA2QD7pSfqIdkI8L1SH4xeBoqwMX1hf16Hy1IuGVz0qm3QC7tx1gFdcHZCKpm9Gvwonh4BT6GR8+fdksltcVRJnz1F+88IqBqjrh0wLJgMvzbuVU9Iw4nn48mHDKYqZIpBJZG7/87Zu1xFJHRqzgbMOBUnwEo5q5v/49CfQp6QsnaQ=', '127.0.0.1', 'active', NULL, NULL),
(9, 1, 'U2FsdGVkX1/l+6adF7UX+9yDh0VQXZtXAvVRqhtkDwXKnL6JGb0wMGgsVinzDiz0ff1tzzmfNT8Kcc3tof0Jfdt5WXESgC6hjuWAzQnDQW0h1YbrUJBF8ZWIpSiywoZ82z6CUVoyEcNspxUvuhcr3v9fNvpol7XlFYFh3s/ftbrEWyW5BK9+hyd6cbgYtMQ7/9M+ZiMzf7v8tL4D/+9CRIP3qz/sy2LbybPbFgb32IY=', '127.0.0.1', 'active', NULL, NULL),
(10, 1, 'U2FsdGVkX181PXDqV2W4tCchLt7Lk0lP7JoI9rHu9xSEg1G5tFS1wbCOhZTgf/x+8kLJs/5H7HwHj7Fn/4nPD+PgX+EAnAHU4LS3XmoaRyImoxoulftyLrUniH9R5sxSSdoDr88gyNJ+OxjgLQR9f+6nm/ioeflrj4q3wgeh7WVsm14F0ocBBsae/OMbLdpiVH8YmVKGY+RPtZ80ZI35ck4oceaLmMWqZEMdv779Nw4=', '127.0.0.1', 'active', NULL, NULL),
(11, 1, 'U2FsdGVkX1+om8nQLnFGWtPJ4q2eYFswb4yZq/iW6bgNv0g5Fe+viGCHZ/dW5q0rG1aC7Ys36863QHlU/0yrFpRLsvVb2aKmRf52m+WLT0KMItShZu0VSEaJ4b5qa+HOOZJavauaaBJ664hcc3WqYvQpgP6Lgcv1Y4hh8RI2EjQSLxvYND7DJQYjKtFKHvI6NQcJY7gzGbMP2moapxcO1zsajCL1PQIq8wUAFHU9YU4=', '127.0.0.1', 'active', NULL, NULL),
(12, 1, 'U2FsdGVkX192r8zB9j/hgvrLPj07M/IPpzuR/crAV/+E5WDQ/To+PZvxhfnjagsbr9hfcb6cMvcds4yhWXPFpTHNCcgk2STU5OwQCXmzYatysak/VwNV1xd3CnqghDGbnIpKBcO5hC56vPX1kHfO03YE0k28dx3+w5wswxsJnKa6fJ0VOqHwCybeuOlOOvNERxu0t3WY7XEoIRJw3sDnNryT/Uk2HXC5yHC/WeEnJyk=', '127.0.0.1', 'active', NULL, NULL),
(13, 1, 'U2FsdGVkX1+ePN+yKsrI6sE6wv3hUGI8ReFhWQsLr2GKC9BieLoLgNuIHPFZdGVXwBmOk/JqHRTP1I/YreJBTVF7l/G8s7+dAibLtiLX972f6jettoWzLX63l9qcBfgm6HsvySzPfGcd6Ws8qxnRpTblyNjcQi4mcZ32+qWVCWAu93xGiAcBMKHyrVnOpkfOJo3eA8T0dExmDjgFyY50cdt7Kwrpo6YWw7P/F/LR/d4=', '127.0.0.1', 'active', NULL, NULL),
(14, 1, 'U2FsdGVkX198b3NDcfdvXFp9Ft2xaedxXItQn71VKbSTAgyy9aBSDsBqLgWYQKCTB/a5cKezHv1/euqUG1Nnt2l/poJ3QomuQfnRB11YljQYCN2kj+PyE0V5TvX+4l1ZA103p9R+CYON3nCWPlGb6Zb5Z8QUxNrZncbe+kdncIQj4S3OEyo2KpiP601YgXHFpY7w8gbP/k0JbZ1nnNFixAC8F+9WKiXAeejcDTcbvS4=', '127.0.0.1', 'active', NULL, NULL),
(15, 1, 'U2FsdGVkX19pnj+tnM1c5JYwqo93OzYtFQZTVoTNXaCZP40oG6Uxjv2MPk5zktu+cNnbgeLpRYft1Y09ULp+2yiFeNYvUURJqhG9FTiPCGbS3NIwqsPyXbWh4gYJJ6ZZUTTjXUsy2bOdboWFyG19uaTV6LWQqU7jsUH2Jp+J5/G5Rg83oMIuREdvNWp9M7cfG6CbG6HVSFII3bqTOD8xDww/1VaXDq92cgZgoZnstgM=', '127.0.0.1', 'active', NULL, NULL),
(16, 1, 'U2FsdGVkX1/4n9GwenZ8d/RPIrZWbSOm+19IUAlMztII5ZvN05xUDrub10NMaSuFwjyY6P0+wRu9/Z8RVtB1oRviUYEebj2EHWcQbTd4YWl1jeI9SICUNGySLXRMKABbHMHmKaCdj3wjCHI++1C+t6CE1WbJPEDlykcQdAQ0fLWjLb+sRZLyMCC1OXBs1XOFTLBOVBwIStJYTldmT8RxEP6EqVRvIvEhv5y8KqYMP2Q=', '127.0.0.1', 'active', NULL, NULL),
(17, 1, 'U2FsdGVkX1/KCutuQULChuXyNWQySDrvxAo7snAnqTpVeW2rnrdJEfvPakGqRWFmjtx7kmXdy8QsBTzM7MANp1Wxdun0oyrWdX3djk7xUZPMZQBNeVZo8YVGBSjierA48a9oZjd65TeJSNL38LN09HP/ZdF+7U8CvDf7lqEaVEfjMQVxfC7B+lyrbrVKTLTutwIS1PLy1UNC1GC7TjRWISppb5fjV38zL9cMRmx4kO0=', '127.0.0.1', 'active', NULL, NULL),
(18, 1, 'U2FsdGVkX1/D0Jenif5Ialk0CJUspKKm+KlkmO4hGRKtiHpqSbBIWv662EZBb++Vw9/nP0QX8RdJbnoJPooGt56VVL8wmeqthxQ8nJrcPrwT50yYikRIyLQmFu3kUt1PKON18U1dht+nX8keooV6WcjOfVZfRLARdVYemvJSDDwhxMSvv2lUTxQDS2ae5LW9Bfdi/hpifshoF6IMzKmZiKcmDAGvFSlNXSthI61mn1g=', '127.0.0.1', 'active', NULL, NULL),
(19, 1, 'U2FsdGVkX1/MPl8ckSn5WmIuBFk3R+E4RGs4vjsdP7j+Zav8F4JzZfwcSTD6GTjtD9P0e2Z+24UK2n9cvfFw2kksyQC1bYBBzBEPfOYGQGKiEn0MO29n0AHCUj+ZIHRIve9ZeULel8eSD0JftsTabtSrLHA2V9/JB5lzhJTH2FRlLsQbn7ma8D48Hb8QZERnfMWEWvDT0FGt+rM3H5LK3qiUP1NsE0bdOBtgBz/qzPw=', '127.0.0.1', 'active', NULL, NULL),
(20, 5, 'U2FsdGVkX19AIzDS7Co4Vb2iaA1W8JMbNrw8q+TrE+9k+VyEKD4lP54Y4aUHR4VJCeoDjdP1SfZulLbInW0rkZeo53mZf4esUP8dHpM7E8tnmUqtc+ZEET8OIX/BiDRnfih/nLJU5pL43yjiLlIHsJSH6dEpJTaLUEVFEebv/S9P+oYo4LQHHJApaqVPSfFqd7uX/ph7DHXXP/QYlCtNs8s7YWGYYuAcgH6jAxd+zs4=', '127.0.0.1', 'active', NULL, NULL),
(21, 6, 'U2FsdGVkX18dV/ATT2BWJyOBua8q8sgtwomEZJJxKcyW/uzNAiGytJ15lnr65Jj62K5qpFejrIZeHNHwITs1IULwFdGAAjaGCg6sPjI1WJ2Kw1iKOAmhPpmF9NJMnCu/Scstfw3jy7TxIcJ3Von0Aub+1N79ugLsQn2NgHW5aS3DiHpN12dWVi7KBhaGzvBhRuKBelCarOjDt6YdTIHAyZKCRVFkxM056F5CnIZq8AQ=', '127.0.0.1', 'active', NULL, NULL),
(22, 7, 'U2FsdGVkX19kof4I2orwsxjNltC5PgXPsASZMdpRp/RCNu5/rwXBQtEaYd5B8ol1Vf68lP3KgVpqo/cktKd5moaTyaOx+9Y7cgZuj12TtRgEBsqGBMhPrrxYwcZk0qSfc8eR/eHrxX4hEORksp9/fLR5mx8hqjrVkX7IYxNM6Tvbqbvlp2ov1ua6uG4VPUTo8Pyx17qqCZlh21slEk1B4tYcNgJulOqqZ2aee7axK7I=', '127.0.0.1', 'active', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `user_cart`
--

CREATE TABLE `user_cart` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `shop_id` bigint(20) DEFAULT NULL,
  `service_id` bigint(20) DEFAULT NULL,
  `status` enum('active','inactive','deleted') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_transaction_logs`
--

CREATE TABLE `user_transaction_logs` (
  `id` int(11) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `type` enum('credit','debit') DEFAULT NULL,
  `date` datetime DEFAULT NULL,
  `transaction_amount` bigint(20) DEFAULT NULL,
  `description` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `user_transaction_logs`
--

INSERT INTO `user_transaction_logs` (`id`, `user_id`, `type`, `date`, `transaction_amount`, `description`) VALUES
(1, 2, 'credit', '2025-06-22 22:56:33', 100, 'amount added to wallet'),
(2, 1, 'credit', '2025-06-23 14:49:44', 1000, 'amount added to wallet'),
(3, 1, 'debit', '2025-06-23 14:51:16', 350, 'appointment booked'),
(4, 1, 'debit', '2025-06-23 15:25:43', 100, 'appointment booked'),
(5, 1, 'debit', '2025-06-23 15:26:07', 100, 'appointment booked'),
(6, 1, 'debit', '2025-06-23 15:26:52', 100, 'appointment booked'),
(7, 1, 'debit', '2025-06-23 15:38:25', 250, 'appointment booked'),
(8, 1, 'credit', '2025-06-23 15:49:35', 1500, 'amount added to wallet'),
(9, 1, 'debit', '2025-06-23 15:51:09', 100, 'appointment booked'),
(10, 1, 'debit', '2025-06-23 15:58:59', 470, 'appointment booked'),
(11, 1, 'debit', '2025-06-23 16:09:42', 350, 'appointment booked'),
(12, 1, 'debit', '2025-06-24 14:48:42', 100, 'appointment booked'),
(13, 1, 'credit', '2025-06-29 12:38:15', 500, 'amount added to wallet');

-- --------------------------------------------------------

--
-- Table structure for table `WalletLogs`
--

CREATE TABLE `WalletLogs` (
  `id` int(11) NOT NULL,
  `date` datetime DEFAULT NULL,
  `amount_added` bigint(20) DEFAULT NULL,
  `balance_before` bigint(20) DEFAULT NULL,
  `balance_after` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `payment_status` enum('pending','success','failed') DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `WalletLogs`
--

INSERT INTO `WalletLogs` (`id`, `date`, `amount_added`, `balance_before`, `balance_after`, `user_id`, `payment_status`, `updated_at`) VALUES
(1, '2025-06-23 18:15:40', 200, 440, 240, 1, NULL, '2025-06-23 18:15:40');

-- --------------------------------------------------------

--
-- Table structure for table `WorkingHours`
--

CREATE TABLE `WorkingHours` (
  `id` int(11) NOT NULL,
  `store_id` bigint(20) DEFAULT NULL,
  `from` time DEFAULT NULL,
  `to` time DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `WorkingHours`
--

INSERT INTO `WorkingHours` (`id`, `store_id`, `from`, `to`) VALUES
(1, 1, '09:30:00', '21:30:00');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `admin`
--
ALTER TABLE `admin`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Adminnotificationlogs`
--
ALTER TABLE `Adminnotificationlogs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `adminSession`
--
ALTER TABLE `adminSession`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Aminities`
--
ALTER TABLE `Aminities`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `appointments`
--
ALTER TABLE `appointments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `appointment_items`
--
ALTER TABLE `appointment_items`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Banner`
--
ALTER TABLE `Banner`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `category`
--
ALTER TABLE `category`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Combinations`
--
ALTER TABLE `Combinations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Combo`
--
ALTER TABLE `Combo`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Coupons`
--
ALTER TABLE `Coupons`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Favourites`
--
ALTER TABLE `Favourites`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `NotificationLogs`
--
ALTER TABLE `NotificationLogs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `OwnerProfile`
--
ALTER TABLE `OwnerProfile`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `PartnerAddress`
--
ALTER TABLE `PartnerAddress`
  ADD PRIMARY KEY (`id`),
  ADD SPATIAL KEY `idx_pa_loc` (`location`);

--
-- Indexes for table `PartnerNotificationLogs`
--
ALTER TABLE `PartnerNotificationLogs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Payments`
--
ALTER TABLE `Payments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `refund_requests`
--
ALTER TABLE `refund_requests`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Reviews`
--
ALTER TABLE `Reviews`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `review_delete_requests`
--
ALTER TABLE `review_delete_requests`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Servicecategory`
--
ALTER TABLE `Servicecategory`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `SettlementLogs`
--
ALTER TABLE `SettlementLogs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Slots`
--
ALTER TABLE `Slots`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Store`
--
ALTER TABLE `Store`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `StoreAminities`
--
ALTER TABLE `StoreAminities`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `StoreServices`
--
ALTER TABLE `StoreServices`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `StoreSession`
--
ALTER TABLE `StoreSession`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `StoreSubscription`
--
ALTER TABLE `StoreSubscription`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `StoreWallet`
--
ALTER TABLE `StoreWallet`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Stylist`
--
ALTER TABLE `Stylist`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `SubscriptionPlans`
--
ALTER TABLE `SubscriptionPlans`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `UsedCoupons`
--
ALTER TABLE `UsedCoupons`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `User`
--
ALTER TABLE `User`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `UserSession`
--
ALTER TABLE `UserSession`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `user_cart`
--
ALTER TABLE `user_cart`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `user_transaction_logs`
--
ALTER TABLE `user_transaction_logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `WalletLogs`
--
ALTER TABLE `WalletLogs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `WorkingHours`
--
ALTER TABLE `WorkingHours`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `admin`
--
ALTER TABLE `admin`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `Adminnotificationlogs`
--
ALTER TABLE `Adminnotificationlogs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `adminSession`
--
ALTER TABLE `adminSession`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- AUTO_INCREMENT for table `Aminities`
--
ALTER TABLE `Aminities`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `appointments`
--
ALTER TABLE `appointments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- AUTO_INCREMENT for table `appointment_items`
--
ALTER TABLE `appointment_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;

--
-- AUTO_INCREMENT for table `Banner`
--
ALTER TABLE `Banner`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `category`
--
ALTER TABLE `category`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `Combinations`
--
ALTER TABLE `Combinations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `Combo`
--
ALTER TABLE `Combo`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `Coupons`
--
ALTER TABLE `Coupons`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `Favourites`
--
ALTER TABLE `Favourites`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `NotificationLogs`
--
ALTER TABLE `NotificationLogs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `OwnerProfile`
--
ALTER TABLE `OwnerProfile`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `PartnerAddress`
--
ALTER TABLE `PartnerAddress`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `PartnerNotificationLogs`
--
ALTER TABLE `PartnerNotificationLogs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `Payments`
--
ALTER TABLE `Payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `refund_requests`
--
ALTER TABLE `refund_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `Reviews`
--
ALTER TABLE `Reviews`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `review_delete_requests`
--
ALTER TABLE `review_delete_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `Servicecategory`
--
ALTER TABLE `Servicecategory`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `SettlementLogs`
--
ALTER TABLE `SettlementLogs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Slots`
--
ALTER TABLE `Slots`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `Store`
--
ALTER TABLE `Store`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `StoreAminities`
--
ALTER TABLE `StoreAminities`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `StoreServices`
--
ALTER TABLE `StoreServices`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `StoreSession`
--
ALTER TABLE `StoreSession`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `StoreSubscription`
--
ALTER TABLE `StoreSubscription`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `StoreWallet`
--
ALTER TABLE `StoreWallet`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Stylist`
--
ALTER TABLE `Stylist`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `SubscriptionPlans`
--
ALTER TABLE `SubscriptionPlans`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `UsedCoupons`
--
ALTER TABLE `UsedCoupons`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `User`
--
ALTER TABLE `User`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `UserSession`
--
ALTER TABLE `UserSession`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT for table `user_cart`
--
ALTER TABLE `user_cart`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_transaction_logs`
--
ALTER TABLE `user_transaction_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `WalletLogs`
--
ALTER TABLE `WalletLogs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `WorkingHours`
--
ALTER TABLE `WorkingHours`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
