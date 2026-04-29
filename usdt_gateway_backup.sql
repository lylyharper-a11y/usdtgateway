--
-- PostgreSQL database dump
--

\restrict 2mEqJobfdKlI7wSMARP2Ku3dPTmg6IFf3uBM077zxMuSjIAFhzWTWvPFWT5n50P

-- Dumped from database version 14.22 (Ubuntu 14.22-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.22 (Ubuntu 14.22-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.withdrawals DROP CONSTRAINT IF EXISTS "withdrawals_partnerId_fkey";
ALTER TABLE IF EXISTS ONLY public.deposits DROP CONSTRAINT IF EXISTS "deposits_walletId_fkey";
ALTER TABLE IF EXISTS ONLY public.deposits DROP CONSTRAINT IF EXISTS "deposits_partnerId_fkey";
DROP INDEX IF EXISTS public."withdrawals_orderCode_key";
DROP INDEX IF EXISTS public.wallets_address_key;
DROP INDEX IF EXISTS public."partners_apiKey_key";
DROP INDEX IF EXISTS public."deposits_orderCode_key";
ALTER TABLE IF EXISTS ONLY public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_pkey;
ALTER TABLE IF EXISTS ONLY public.wallets DROP CONSTRAINT IF EXISTS wallets_pkey;
ALTER TABLE IF EXISTS ONLY public.settings DROP CONSTRAINT IF EXISTS settings_pkey;
ALTER TABLE IF EXISTS ONLY public.rate_history DROP CONSTRAINT IF EXISTS rate_history_pkey;
ALTER TABLE IF EXISTS ONLY public.partners DROP CONSTRAINT IF EXISTS partners_pkey;
ALTER TABLE IF EXISTS ONLY public.deposits DROP CONSTRAINT IF EXISTS deposits_pkey;
ALTER TABLE IF EXISTS ONLY public.admin_logs DROP CONSTRAINT IF EXISTS admin_logs_pkey;
DROP TABLE IF EXISTS public.withdrawals;
DROP TABLE IF EXISTS public.wallets;
DROP TABLE IF EXISTS public.settings;
DROP TABLE IF EXISTS public.rate_history;
DROP TABLE IF EXISTS public.partners;
DROP TABLE IF EXISTS public.deposits;
DROP TABLE IF EXISTS public.admin_logs;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_logs; Type: TABLE; Schema: public; Owner: usdtgw
--

CREATE TABLE public.admin_logs (
    id text NOT NULL,
    action text NOT NULL,
    target text,
    detail text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.admin_logs OWNER TO usdtgw;

--
-- Name: deposits; Type: TABLE; Schema: public; Owner: usdtgw
--

CREATE TABLE public.deposits (
    id text NOT NULL,
    "orderCode" text NOT NULL,
    "externalId" text,
    "partnerId" text NOT NULL,
    "walletId" text,
    "amountUsdt" double precision NOT NULL,
    "exchangeRate" double precision DEFAULT 0 NOT NULL,
    "amountVnd" double precision DEFAULT 0 NOT NULL,
    "txHash" text,
    "fromAddress" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "callbackSent" boolean DEFAULT false NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.deposits OWNER TO usdtgw;

--
-- Name: partners; Type: TABLE; Schema: public; Owner: usdtgw
--

CREATE TABLE public.partners (
    id text NOT NULL,
    name text NOT NULL,
    "apiKey" text NOT NULL,
    "secretKey" text NOT NULL,
    "callbackUrl" text,
    "buySpread" double precision DEFAULT 1 NOT NULL,
    "sellSpread" double precision DEFAULT 1 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.partners OWNER TO usdtgw;

--
-- Name: rate_history; Type: TABLE; Schema: public; Owner: usdtgw
--

CREATE TABLE public.rate_history (
    id text NOT NULL,
    rate double precision NOT NULL,
    source text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.rate_history OWNER TO usdtgw;

--
-- Name: settings; Type: TABLE; Schema: public; Owner: usdtgw
--

CREATE TABLE public.settings (
    key text NOT NULL,
    value text NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.settings OWNER TO usdtgw;

--
-- Name: wallets; Type: TABLE; Schema: public; Owner: usdtgw
--

CREATE TABLE public.wallets (
    id text NOT NULL,
    label text NOT NULL,
    address text NOT NULL,
    "privateKey" text NOT NULL,
    network text DEFAULT 'TRC20'::text NOT NULL,
    "walletType" text DEFAULT 'BOTH'::text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    balance double precision DEFAULT 0 NOT NULL,
    "usageCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.wallets OWNER TO usdtgw;

--
-- Name: withdrawals; Type: TABLE; Schema: public; Owner: usdtgw
--

CREATE TABLE public.withdrawals (
    id text NOT NULL,
    "orderCode" text NOT NULL,
    "externalId" text,
    "partnerId" text NOT NULL,
    "amountUsdt" double precision NOT NULL,
    "exchangeRate" double precision NOT NULL,
    "amountVnd" double precision NOT NULL,
    "toAddress" text NOT NULL,
    "toNetwork" text DEFAULT 'TRC20'::text NOT NULL,
    "txHash" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "callbackSent" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.withdrawals OWNER TO usdtgw;

--
-- Data for Name: admin_logs; Type: TABLE DATA; Schema: public; Owner: usdtgw
--

COPY public.admin_logs (id, action, target, detail, "createdAt") FROM stdin;
b86b134c-1482-41ef-bc44-4d8fe55db7de	UNMATCHED_DEPOSIT	ef197f624775d6e278867fbea61e5b24190198872e0da31b6b471dc515aacb1a	{"wallet":"TCYYWbxUpDB2DZqWaE4LM24XEA139yr9Hf","from":"TCLgK89AnXbC9rewvhNb9UgXCc2qJJpBXh","amount":11,"timestamp":"2026-04-16T03:00:00.898Z"}	2026-04-16 03:00:00.899
acd60ca4-9498-4e29-a068-9f04cb250f82	UNMATCHED_DEPOSIT	36da7ecb509499367bf64a65fbc31fb6fd604235509818fe9cdacec3797d986b	{"wallet":"TCYYWbxUpDB2DZqWaE4LM24XEA139yr9Hf","from":"TDqSquXBgUCLYvYC4XZgrprLK589dkhSCf","amount":10,"timestamp":"2026-04-16T03:00:00.907Z"}	2026-04-16 03:00:00.908
975e44d8-858b-4c5c-9626-4c4198dd2331	UNMATCHED_DEPOSIT	fbc1d055c72594463e587c7798e70a30f72e40c0a85628d1b8ce893d45a0613f	{"wallet":"TCYYWbxUpDB2DZqWaE4LM24XEA139yr9Hf","from":"TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G","amount":10.8,"timestamp":"2026-04-16T03:00:00.916Z"}	2026-04-16 03:00:00.917
\.


--
-- Data for Name: deposits; Type: TABLE DATA; Schema: public; Owner: usdtgw
--

COPY public.deposits (id, "orderCode", "externalId", "partnerId", "walletId", "amountUsdt", "exchangeRate", "amountVnd", "txHash", "fromAddress", status, "callbackSent", "expiresAt", "createdAt", "updatedAt") FROM stdin;
7519b9bb-8f86-4950-9b98-ba4d7e84bb8e	UDEP-MO0W7USU-44E0	\N	fdb5c8a4-3e0b-484f-9d0f-b13b995d937f	9f482fba-57c5-488c-b7db-d518a36a96a4	10	26317	263170	d505496fdb9256ad6b459271eea55052f14b569308e2ca2988ebbba1706f0fed	TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G	CONFIRMED	f	2026-04-16 03:31:40.399	2026-04-16 03:01:40.4	2026-04-16 03:04:00.837
\.


--
-- Data for Name: partners; Type: TABLE DATA; Schema: public; Owner: usdtgw
--

COPY public.partners (id, name, "apiKey", "secretKey", "callbackUrl", "buySpread", "sellSpread", "isActive", "createdAt", "updatedAt") FROM stdin;
fdb5c8a4-3e0b-484f-9d0f-b13b995d937f	Demo Partner	ugw_demo_test_key_12345	demo_secret_key_for_testing	\N	1	1	t	2026-04-16 02:14:27.258	2026-04-16 02:14:27.258
\.


--
-- Data for Name: rate_history; Type: TABLE DATA; Schema: public; Owner: usdtgw
--

COPY public.rate_history (id, rate, source, "createdAt") FROM stdin;
2510649b-b50a-4cfc-98fb-68014d6ba4d5	26586	binance_p2p	2026-04-16 02:38:11.698
d12f233c-3652-4d69-9c80-67cf49947f33	26583	binance_p2p	2026-04-16 03:01:33.45
274eac1a-0295-468c-94e2-0799e1e1f797	26583	binance_p2p	2026-04-16 03:02:03.83
fe4cb38d-6314-4af7-aad9-70b2425af7cd	26583	binance_p2p	2026-04-16 03:02:33.825
851d6fe6-1e26-452f-b002-ba018ac7cf71	26583	binance_p2p	2026-04-16 03:03:03.348
c6bdaf02-ec85-425a-b777-957fabf906b8	26583	binance_p2p	2026-04-16 03:03:33.362
54a4c021-a13a-4a3c-8dfb-152ef22699dc	26583	binance_p2p	2026-04-16 03:04:03.806
2022c7a6-32f5-47ea-adb9-770cf320db01	26583	binance_p2p	2026-04-16 03:04:33.798
2efef6fd-2d9e-4c93-bb07-86c0b660d9b9	26583	binance_p2p	2026-04-16 03:05:11.795
83f8ef05-b23a-4093-bb07-279c6b6a12a7	26583	binance_p2p	2026-04-16 03:05:55.1
b9e72ec7-164d-4e00-8776-7466035ef807	26583	binance_p2p	2026-04-16 03:06:03.846
101434bf-3f5f-4250-a141-419b3d320f6c	26582	binance_p2p	2026-04-16 03:06:33.825
ac407c24-02f6-40f0-9818-06d01d8412c7	26581	binance_p2p	2026-04-16 03:07:26.832
63d29fff-4eed-4f86-9432-0a7cd8d7dc48	26581	binance_p2p	2026-04-16 03:08:26.832
b0c94e6d-cf80-41a5-bc84-e00b3eec89f8	26581	binance_p2p	2026-04-16 03:09:26.828
2c22d329-1a6c-43f1-8a3d-900b2639f677	26581	binance_p2p	2026-04-16 03:10:12.173
5e072cb3-a580-4114-a43e-08d3eb81f49d	26581	binance_p2p	2026-04-16 03:10:33.829
bfd2dc55-6d78-4923-b870-852b5845ec6b	26581	binance_p2p	2026-04-16 03:11:03.819
a349a261-92a4-493d-9330-3ef0ef1cf194	26568	binance_p2p	2026-04-16 03:12:04.8
57b9f2f4-906f-4165-a295-8dd0944bb408	26567	binance_p2p	2026-04-16 03:13:05.833
8f36721a-ccb7-4417-8a0f-6b6c9e8f02a7	26567	binance_p2p	2026-04-16 03:14:06.818
47e36959-1b7b-499f-aa32-c59d07e8a968	26567	binance_p2p	2026-04-16 03:15:07.829
1a5746f9-b974-4dc1-bbb1-a1921ff1927b	26566	binance_p2p	2026-04-16 03:16:08.997
8596ca51-0b06-4f6a-9d1c-1150b15012ab	26564	binance_p2p	2026-04-16 03:17:09.804
a0aa32ae-8f7f-478f-86a7-38415effb62f	26564	binance_p2p	2026-04-16 03:18:10.792
86d83800-3996-4508-ae20-a1ee0976ca86	26564	binance_p2p	2026-04-16 03:19:11.796
7278370c-5556-44d9-948f-5d3f3cd5fc87	26564	binance_p2p	2026-04-16 03:20:12.804
a7dbd8cb-709c-48bf-a7b3-f097a6952eaa	26564	binance_p2p	2026-04-16 03:21:13.75
081d178f-8ac8-4376-a375-868280056719	26562	binance_p2p	2026-04-16 03:22:14.778
f75caa13-b2c5-477a-b8f7-2c7c20a36c9b	26573	binance_p2p	2026-04-16 03:23:15.741
5950db67-f1f2-4f1e-bf72-cecae1c90c24	26555	binance_p2p	2026-04-16 03:24:16.749
6b01b961-f6a7-4538-a482-951ac86d1922	26555	binance_p2p	2026-04-16 03:24:30.149
ef705772-4ff5-48d9-a58c-31a739d32edf	26555	binance_p2p	2026-04-16 03:24:33.07
8a74042f-da10-42c1-8073-d064b7c91138	26555	binance_p2p	2026-04-16 03:25:03.746
4e7a0a97-3475-4d02-895e-7bd769fb57bb	26555	binance_p2p	2026-04-16 03:25:33.757
27c9daee-85d2-40ee-9f32-fe655e351ea8	26554	binance_p2p	2026-04-16 03:26:03.758
57d7c1e5-98e0-4df4-b603-ce3bc0549378	26554	binance_p2p	2026-04-16 03:26:33.759
f89953b3-ebb3-40fa-95d3-28229a2b58ad	26554	binance_p2p	2026-04-16 03:27:03.785
5b313b5f-6f12-49c0-bd73-dd93f64710ff	26554	binance_p2p	2026-04-16 03:27:33.739
af857736-648f-4166-9cff-eb57632eff37	26554	binance_p2p	2026-04-16 03:28:03.744
2ca78817-9281-4fbc-9294-dbb40162052b	26554	binance_p2p	2026-04-16 03:29:04.756
d0473dc0-682d-42b3-8d3a-f3adf4d60fe8	26553	binance_p2p	2026-04-16 03:30:05.741
b2449a08-830c-42d2-9705-ef033d2b26c9	26553	binance_p2p	2026-04-16 03:31:06.746
3f39b40e-a7f5-4be2-863e-e680b3c0cb75	26552	binance_p2p	2026-04-16 03:32:07.789
d4185995-7656-4058-b838-d7ff8ffd6f82	26545	binance_p2p	2026-04-16 03:33:08.814
e46238f1-cf20-4fab-b012-2a45ca2a248b	26548	binance_p2p	2026-04-16 03:34:09.725
128e04aa-2da3-4318-b02f-d16d40d5b7ab	26548	binance_p2p	2026-04-16 03:35:10.724
e2ee61e5-f0c5-481f-8625-fa57466339d8	26548	binance_p2p	2026-04-16 03:36:11.716
3b7fa058-4b17-470c-8310-172718496012	26548	binance_p2p	2026-04-16 03:37:12.743
7ed9228c-5305-49f1-8be1-d6e2c028c878	26548	binance_p2p	2026-04-16 03:38:13.714
8420f001-8d5e-4c04-a462-f82fdbde4385	26547	binance_p2p	2026-04-16 03:39:14.745
e966658e-c6bc-4fea-83e0-72ac98ffabe6	26547	binance_p2p	2026-04-16 03:40:15.724
c487c07c-98eb-42e5-9157-212d2139fdbd	26555	binance_p2p	2026-04-16 03:41:16.727
2e5f2c45-74a2-46e2-8ff7-10eb8f5def20	26555	binance_p2p	2026-04-16 03:42:17.722
03ae4175-0cd3-41ab-90b5-6322d05273f5	26554	binance_p2p	2026-04-16 03:43:18.736
150c2aa2-6dc9-4b9d-8e32-82e23a3b576c	26553	binance_p2p	2026-04-16 03:44:19.701
fb64de0a-1b48-4d2d-9cbd-3bac99f2eda0	26553	binance_p2p	2026-04-16 03:45:20.724
5907ec5b-6a6f-4440-9d84-f082b4645e70	26553	binance_p2p	2026-04-16 03:46:21.704
0d082f5d-b2ed-4dd2-8fd0-de00adfb5c6a	26559	binance_p2p	2026-04-16 03:47:24.057
fadf1412-ed57-4782-9e6f-93ed8de1e3c4	26559	binance_p2p	2026-04-16 03:48:23.696
70f99c91-a8d7-42fe-9a2c-79f348257022	26565	binance_p2p	2026-04-16 03:49:24.678
184e4de2-0c2e-485d-a51e-abad2f2543f3	26551	binance_p2p	2026-04-16 03:50:25.707
8c109786-a0e8-45f1-91b3-0ffb307ec193	26551	binance_p2p	2026-04-16 03:51:26.787
8662343b-15bc-4ae8-8f8f-ef6974658c33	26552	binance_p2p	2026-04-16 03:52:26.676
866ab53d-8803-4575-88f5-1d99e3a0b356	26552	binance_p2p	2026-04-16 03:53:26.675
96da08b3-9f5c-4d22-8cdb-b9b401a3e752	26552	binance_p2p	2026-04-16 03:54:26.687
31cb16c0-13a2-41c0-8106-fa14c6af8ea6	26552	binance_p2p	2026-04-16 03:55:26.694
c53a0339-7825-4aad-bc14-ecf84bc318c6	26552	binance_p2p	2026-04-16 03:56:26.773
8934b850-8989-4c4d-855c-4cb37bec8857	26552	binance_p2p	2026-04-16 03:57:26.658
cc679858-2120-4e50-97e9-1f8e6e1175a6	26551	binance_p2p	2026-04-16 03:58:26.778
39c7e610-2145-4e6b-8ff2-8f94dc2f0079	26551	binance_p2p	2026-04-16 03:59:26.649
e0759ec0-e5c2-41e1-b47a-77ce3f76c093	26551	binance_p2p	2026-04-16 04:00:26.66
c9d1629e-e0aa-4fdf-8640-95d2773a26c2	26551	binance_p2p	2026-04-16 04:01:26.677
e9d412c9-5bde-473a-8d80-167702a692ce	26551	binance_p2p	2026-04-16 04:02:26.681
62bb8050-cf0c-4194-b9aa-b2f63cb70a2f	26550	binance_p2p	2026-04-16 04:03:26.674
a05c45c9-d6f6-4010-9667-f3996c4608ef	26549	binance_p2p	2026-04-16 04:04:26.658
457c45ff-4bba-4d29-9321-5fd17aa173bf	26571	binance_p2p	2026-04-16 14:22:24.466
\.


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: usdtgw
--

COPY public.settings (key, value, "updatedAt") FROM stdin;
telegram_bot_token	8656733773:AAHtdZ8bRHPt6QkeIz6UTOM3-PltVn6lLko	2026-04-16 02:44:08.608
alert_login	false	2026-04-16 10:34:29.271
api_rate_limit	60	2026-04-16 10:34:29.271
auto_withdraw_max	200	2026-04-16 10:34:29.27
trongrid_api_key	4bb7dd6e-9a38-44e9-9f10-b9ac1d1d4c4c	2026-04-16 10:34:29.27
daily_withdraw_limit	0	2026-04-16 10:34:29.27
rate_mode	auto	2026-04-16 10:34:29.27
alert_wallet	true	2026-04-16 10:34:29.271
alert_deposit	true	2026-04-16 10:34:29.271
telegram_chat_id	-1003751127133	2026-04-16 10:34:29.272
admin_ip_whitelist		2026-04-16 10:34:29.272
admin_ip_whitelist_enabled	false	2026-04-16 10:34:29.272
2fa_enabled	true	2026-04-16 10:34:29.272
deposit_expiry_minutes	30	2026-04-16 10:34:29.272
withdraw_mode	manual	2026-04-16 10:34:29.272
alert_partner	true	2026-04-16 10:34:29.271
alert_low_trx	false	2026-04-16 10:34:29.271
alert_withdrawal	true	2026-04-16 10:34:29.271
alert_unmatched	true	2026-04-16 10:34:29.271
withdraw_cooldown	0	2026-04-16 10:34:29.271
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: usdtgw
--

COPY public.wallets (id, label, address, "privateKey", network, "walletType", status, balance, "usageCount", "createdAt", "updatedAt") FROM stdin;
9f482fba-57c5-488c-b7db-d518a36a96a4	Ví TCYYWb...r9Hf	TCYYWbxUpDB2DZqWaE4LM24XEA139yr9Hf	U2FsdGVkX191TCR62maTtshHvG6C2zBmTG2z14mnlsMQQyr7rnwZfAfZx+fpVtwvlhN+JgIzpxvnfwCRaQV5mdCHc10Uic25XeLQ6BuuAnUtVMUm4juSh7B5ljsVb6GO	TRC20	BOTH	ACTIVE	1.8	1	2026-04-16 02:59:39.291	2026-04-29 11:42:00.95
\.


--
-- Data for Name: withdrawals; Type: TABLE DATA; Schema: public; Owner: usdtgw
--

COPY public.withdrawals (id, "orderCode", "externalId", "partnerId", "amountUsdt", "exchangeRate", "amountVnd", "toAddress", "toNetwork", "txHash", status, "callbackSent", "createdAt", "updatedAt") FROM stdin;
087d4838-6836-4812-b0e7-b0c208cc7d6b	UWD-MO0X1R69-EEDA	\N	fdb5c8a4-3e0b-484f-9d0f-b13b995d937f	30	26821	804630	TVhCRWuqbEiDFKGtiqXYJLmoh9iiZsA6j4	TRC20	693c288e538dc0b284cbdda5f75d9f397e8b27c9854a9b125189911d3bb85679	SENT	f	2026-04-16 03:24:55.378	2026-04-16 03:25:31.72
\.


--
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--
-- Name: deposits deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT deposits_pkey PRIMARY KEY (id);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: rate_history rate_history_pkey; Type: CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.rate_history
    ADD CONSTRAINT rate_history_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (key);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: withdrawals withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT withdrawals_pkey PRIMARY KEY (id);


--
-- Name: deposits_orderCode_key; Type: INDEX; Schema: public; Owner: usdtgw
--

CREATE UNIQUE INDEX "deposits_orderCode_key" ON public.deposits USING btree ("orderCode");


--
-- Name: partners_apiKey_key; Type: INDEX; Schema: public; Owner: usdtgw
--

CREATE UNIQUE INDEX "partners_apiKey_key" ON public.partners USING btree ("apiKey");


--
-- Name: wallets_address_key; Type: INDEX; Schema: public; Owner: usdtgw
--

CREATE UNIQUE INDEX wallets_address_key ON public.wallets USING btree (address);


--
-- Name: withdrawals_orderCode_key; Type: INDEX; Schema: public; Owner: usdtgw
--

CREATE UNIQUE INDEX "withdrawals_orderCode_key" ON public.withdrawals USING btree ("orderCode");


--
-- Name: deposits deposits_partnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT "deposits_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES public.partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: deposits deposits_walletId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.deposits
    ADD CONSTRAINT "deposits_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES public.wallets(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: withdrawals withdrawals_partnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: usdtgw
--

ALTER TABLE ONLY public.withdrawals
    ADD CONSTRAINT "withdrawals_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES public.partners(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

GRANT ALL ON SCHEMA public TO usdtgw;


--
-- PostgreSQL database dump complete
--

\unrestrict 2mEqJobfdKlI7wSMARP2Ku3dPTmg6IFf3uBM077zxMuSjIAFhzWTWvPFWT5n50P

