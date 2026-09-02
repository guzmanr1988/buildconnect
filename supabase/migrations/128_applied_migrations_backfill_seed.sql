-- 128_applied_migrations_backfill_seed.sql
-- Seeds provenance='backfill_assumed' + applied_by='unknown_pre_ledger' rows
-- for the 100 pre-ledger migrations (001-126, excluding 127 which recorded
-- itself via its own footer). These CANNOT be retroactively proven applied —
-- the ledger did not exist when they ran. provenance='backfill_assumed' is a
-- durable non-collapsible marker; kratos's state/migration-apply-check.sh
-- reports these as "assumed", not "verified", and the two are never combined
-- into a single healthy number.
--
-- applied_by='unknown_pre_ledger' rather than any real agent name: 001-126
-- were applied by a mix of actors over months (kratos, iris, apollo,
-- hephaestus, some pre-agent-fleet), and the actor is not recoverable.
-- Recording any real name here would be fabricated attribution and would
-- defeat the guard on the neighbouring provenance column by writing the
-- same lie into the field beside it (kratos ehidn: NEIGHBOURING-FIELD ESCAPE).
--
-- content_sha256 for each pre-ledger file = git show origin/main:<file>
-- | awk '/^-- LEDGER FOOTER BOUNDARY BELOW/{exit}{print}' | shasum -a 256.
-- These files predate the boundary marker so awk falls through and hashes
-- the whole file; verified on 126 (byte-identical to plain `git show|shasum`).
-- This represents CURRENT on-disk content, not the historically applied
-- content — the checker's day-one comparison is trivially clean because the
-- seed is derived from the same source it will be compared against, but from
-- seed time FORWARD it is a live tripwire: edit 001 next month and drift
-- appears. Checker must NEVER report day-one no-drift as evidence of anything.
--
-- Aggregate sha of the deterministic (filename\tsha256) TSV over all 100
-- files at 3f1193c (post-squash first-parent of PR #605 on origin/main —
-- permanent, not the pre-squash branch head 43f1830 which is unreachable
-- from a fresh clone):
--   b84635081d128689e1bbb517d6ae108c012bbd5aad7243254f0343b6c30e7569
-- Re-derive locally with:
--   cd <repo root> && (for f in supabase/migrations/*.sql; do
--     base=$(basename "$f")
--     sha=$(git show 3f1193c:"$f" | \
--       awk '/^-- LEDGER FOOTER BOUNDARY BELOW/{exit}{print}' | \
--       shasum -a 256 | cut -d ' ' -f1)
--     printf "%s\t%s\n" "$base" "$sha"
--   done) | shasum -a 256
-- Non-matching aggregate = canonicalization drift; do NOT apply until resolved.

begin;

insert into public.applied_migrations (filename, content_sha256, applied_by, provenance) values
  ('001_create_profiles.sql', '2c28d5cc5156a715f44aa7a5c91a15fbde37b08b4f1091d56cce5dbfe3a7d323', 'unknown_pre_ledger', 'backfill_assumed'),
  ('002_create_leads.sql', 'bf7995da6d22094d015de1deaeb0ca6707be8cec4c07c0732455924d71da9074', 'unknown_pre_ledger', 'backfill_assumed'),
  ('003_create_closed_sales.sql', 'f052d03767e3160189b0b74855dbc0f84256546ba0385bdda1f10faa1cba923e', 'unknown_pre_ledger', 'backfill_assumed'),
  ('004_create_catalog_items.sql', 'bbefee6ba4981295cc647cb3b249f98b36db70605a1331ae1c17027321622b90', 'unknown_pre_ledger', 'backfill_assumed'),
  ('005_create_messages.sql', 'b8186beb1db934fc955e1b0571f75c3e8b5f0520b89885e6588fcdafd875d3bf', 'unknown_pre_ledger', 'backfill_assumed'),
  ('006_create_transactions.sql', '4e33493ec2f58c440d40f6cf876dbfecd9de9feeb6bd16770f251f80e71881cb', 'unknown_pre_ledger', 'backfill_assumed'),
  ('007_create_bank_accounts.sql', '6bf927b5cb76af521befdce3096804b2a3f20913d4f9002bca80ca041ce23ce0', 'unknown_pre_ledger', 'backfill_assumed'),
  ('008_create_app_settings.sql', '5cb475b6155aa4d9afd0ef280d424d13b92a07104b92c11e32b45e318762f0dc', 'unknown_pre_ledger', 'backfill_assumed'),
  ('009_create_bugs.sql', '20fe129b654ffe2eeb07dfef15c955190feee9d55570066f1abf6f61ceb39ce9', 'unknown_pre_ledger', 'backfill_assumed'),
  ('010_create_rls_policies.sql', '377ef557d2ae0a74128196b20826216dfd0725ae0e7e354c6a4e8a5454da4c2a', 'unknown_pre_ledger', 'backfill_assumed'),
  ('011_create_functions_triggers.sql', 'd90662e23f05999357777b6f557d3183c110fe6a2e05378038a87babc3e67c79', 'unknown_pre_ledger', 'backfill_assumed'),
  ('012_create_projects.sql', 'c38bcd9ae485a80d195f0504f54a5f6d691b52f84801eb7aa90dc2dfe6a97d22', 'unknown_pre_ledger', 'backfill_assumed'),
  ('013_add_nca_columns.sql', '3c866b1765d5e68f6ac35b3082070487138989807fe34d543450d29955af664e', 'unknown_pre_ledger', 'backfill_assumed'),
  ('014_fix_handle_new_user_search_path.sql', '273f90423d8b581d8f2fea062ee7a103361d2407598a469a71e1e4eb8e4fa4cd', 'unknown_pre_ledger', 'backfill_assumed'),
  ('015_add_account_rep_role.sql', 'e28b51f54c83b4ffb1d450d1efacbadca55d5cd29f680429399abe713a72582f', 'unknown_pre_ledger', 'backfill_assumed'),
  ('016_rename_nca_columns.sql', '0972cd27556e60df0b6202757b9a41b2f456e1c882b93a9ad1aaf41e8145deec', 'unknown_pre_ledger', 'backfill_assumed'),
  ('017_vendor_option_prices_rls.sql', 'dce5b56af78bb7611e17f33dca79399b27ac061a5accaff4108d2b3e7d5ab7fe', 'unknown_pre_ledger', 'backfill_assumed'),
  ('018_create_sent_projects.sql', '73c9e0e8fb3ac201dead27a0c9320d1117d586e83d8dd7e44293cc90b5ff57bf', 'unknown_pre_ledger', 'backfill_assumed'),
  ('019_create_vendor_change_requests.sql', 'a489fb10cd895abf671c4a864ff43d504c4d3dccbbd2bdefbdfe08d5a74860f6', 'unknown_pre_ledger', 'backfill_assumed'),
  ('020_create_vendor_employees.sql', 'e45b4c4ba9d846b4be39953fff18b2794361a21627b0fcbcea9426e78b7d9808', 'unknown_pre_ledger', 'backfill_assumed'),
  ('021_create_vendor_homeowner_documents.sql', 'b52d28a18069a72efe5e057557280e80de6c0e900212daf24f32508527ef80f0', 'unknown_pre_ledger', 'backfill_assumed'),
  ('022_add_profile_columns.sql', 'e71bfcb23293b07667a6a57daffd187aa20c083d43c2abd88fc11864dfc8724d', 'unknown_pre_ledger', 'backfill_assumed'),
  ('023_add_service_categories_to_profiles.sql', 'f5cd0eeb30ff1ce42fa91887a4de66e4f7acac1f68ad7a562dcde79d737bbaca', 'unknown_pre_ledger', 'backfill_assumed'),
  ('024_add_blinds_fencing_to_service_category.sql', 'abafb9274ee84c254da90733e37bc6e60b2a1ca9f383b26abf5a44a331913e22', 'unknown_pre_ledger', 'backfill_assumed'),
  ('025_add_phone_address_company_to_handle_new_user.sql', '067921cdf1030657972499a412618754bb9ab81d63a7ae54495e469c62321c07', 'unknown_pre_ledger', 'backfill_assumed'),
  ('026_add_lat_lng_to_profiles.sql', 'd8865809249d7321c97dc141d3b3fe5b1eeceba23aea78184f7d96757bb17d60', 'unknown_pre_ledger', 'backfill_assumed'),
  ('027_add_missing_catalog_options.sql', '5c1d4a1ec8cbfe2cfec8d96da6bd98bc5d6807692f8c40f5e6593aa6150d7752', 'unknown_pre_ledger', 'backfill_assumed'),
  ('028_permit_price_and_water_feature_units.sql', 'f3497c22fdb9e1cec6c37c7a4bc912b2f5d0b07ea074b0b6ad0d2b107e77297b', 'unknown_pre_ledger', 'backfill_assumed'),
  ('029_vendor_service_permits.sql', 'fbbc5d2180622a07457f6896f4d6982ddef0101004000971fd168da4583c9809', 'unknown_pre_ledger', 'backfill_assumed'),
  ('030_add_repair_materials_options.sql', '4569fdba4c3bbe6d1e68b5b88abead0284a6ec4e056f1b812b2b48596f5c9c2c', 'unknown_pre_ledger', 'backfill_assumed'),
  ('031_add_price_unit_to_options.sql', 'd5e7ba65d99473f966fa94b23a8f8692b5efef3def1dbd99cc7599933022baef', 'unknown_pre_ledger', 'backfill_assumed'),
  ('032_drop_air_conditioning_permit_optiongroup.sql', 'aafde548187d0da8d28dcb186159e3452a1c11adf795e4a7bd988046ee0ce439', 'unknown_pre_ledger', 'backfill_assumed'),
  ('033_roofing_material_type_multi.sql', '6ae918d2953df91430e65ab1a2153c2f4282ae2ddfbd7fd84a6698a704f9d796', 'unknown_pre_ledger', 'backfill_assumed'),
  ('034_pin_close_lead_sale_search_path.sql', '52815cc4544ba4c168626a561d4b066e6adaf3ae9e785dcd86a3dfeedb1e7b36', 'unknown_pre_ledger', 'backfill_assumed'),
  ('035_create_reschedule_requests.sql', 'df087b656c34083865dab9912868312be50d45c8701c8f0d1e0173a3de957122', 'unknown_pre_ledger', 'backfill_assumed'),
  ('036_backfill_price_unit_flat_default.sql', '937f3446812655c930fb692597d85ec787b81ed0454670ce326b408ba3a87656', 'unknown_pre_ledger', 'backfill_assumed'),
  ('037_add_id_document_url.sql', '1e710b859b6188f9c852bdef9c719ac2ab41993f08ba32f432d261e2ad6045c6', 'unknown_pre_ledger', 'backfill_assumed'),
  ('038_admin_reset_password_audit_log.sql', '1ff0599c87c0c773fef958b7c417eacaff11b4bf590eb3208f86cbf55c74127e', 'unknown_pre_ledger', 'backfill_assumed'),
  ('040_sent_projects_status_transitions.sql', '4d6724dc48e23b7a4e515acc904804732869a9ea8fd2e1c4c5c8dcac5e8a9978', 'unknown_pre_ledger', 'backfill_assumed'),
  ('041_services_status_enum.sql', '404f79c8c0435fc4f908e40d32f2e6b3e1c261885fb299188eee95b8032f3499', 'unknown_pre_ledger', 'backfill_assumed'),
  ('042_remove_garage_phase1_options.sql', '3e3239b559084fe140b293297266cf21becf8e20d6e98cb6f63467fd286785b6', 'unknown_pre_ledger', 'backfill_assumed'),
  ('043_rename_garage_service_to_remodel.sql', '163b3a1fc2f75a91a54568521ac863cc0b7aa52097479f50fc469d01774a93e9', 'unknown_pre_ledger', 'backfill_assumed'),
  ('045_rename_kitchen_remodel_to_kitchen.sql', '82f129ad03fb0719af8dad02f18241b28f58b97387b5c57b732fbedf20f47a68', 'unknown_pre_ledger', 'backfill_assumed'),
  ('046_homeowner_documents_and_draft_projects.sql', 'f29fc74277eddfa291a3b8a7bccb7726697198c272b5c169c12342e34e81e2bd', 'unknown_pre_ledger', 'backfill_assumed'),
  ('047_financing_core_tables.sql', '74daacd4176ad0dc1cb6511f0e32519cc18928233d31007612eac7ca82569f5c', 'unknown_pre_ledger', 'backfill_assumed'),
  ('048_admin_financing_surface.sql', '668c3f7a7e90d2c2b9e6f2cac7faf415ee799cd8a3b206b75c902287277d0d4b', 'unknown_pre_ledger', 'backfill_assumed'),
  ('049_lenders_seed.sql', '430d3d48454fecf25f0e8720a820ffbf68fbad4a24d5a80755c6a4be380dc0bd', 'unknown_pre_ledger', 'backfill_assumed'),
  ('050_lenders_seed_wells_fargo.sql', '865bbbfe1ff24f057264956ed8e8e18d83d182c4dbbbd20a59f046046ff08de9', 'unknown_pre_ledger', 'backfill_assumed'),
  ('051_audit_action_admin_create_approval.sql', 'a1effa2fb7f42a4641bc41f8944a69771cf4bf29877f4ea58da59febefced7c8', 'unknown_pre_ledger', 'backfill_assumed'),
  ('052_feature_flags_admin_insert_and_category_seed.sql', '3d949f42d21b19bdb64f1ee48a4a2f46e6e3c2fd657d106e6b6c9888a0d414c3', 'unknown_pre_ledger', 'backfill_assumed'),
  ('053_audit_triggers_lenders_and_feature_flags.sql', 'df07e76f64c34036379f5fde09d4e87692ea939d1af7c351a31626aae1eac243', 'unknown_pre_ledger', 'backfill_assumed'),
  ('054_feature_flags_realtime_publication.sql', '4c34bb47055934aa44850da1da4e05030801a38fab2fba78ca682fc1286724c4', 'unknown_pre_ledger', 'backfill_assumed'),
  ('056_pace_financing_category_and_lenders_seed.sql', '91231ef4cd291c0359bfb484b6534f6947ae892ceb069f94edee32a3e68da0e0', 'unknown_pre_ledger', 'backfill_assumed'),
  ('057_lender_apply_url_and_instructions.sql', 'a3a70cd87b3985def0e8cfaf2f7fc63cddbed296aaf22523f6457cde9298ab9a', 'unknown_pre_ledger', 'backfill_assumed'),
  ('058_cfp_update_admin_policy.sql', 'f4f42691f647ac9e4f24b364d55a3e2216e3b5284007a749387fedbaff13eace', 'unknown_pre_ledger', 'backfill_assumed'),
  ('059_extend_audit_to_financing.sql', '1a44b2ea9ab41b5fbfd883d679c60d87357ed3bed36c3980bbd461754c6576ac', 'unknown_pre_ledger', 'backfill_assumed'),
  ('060_sub_groups_description.sql', '8a657b7b3dcdc18b45f07eaa95305577c0dfd0f156e52636425bfafa58f9dc25', 'unknown_pre_ledger', 'backfill_assumed'),
  ('062_add_image_urls_to_options.sql', 'eda9748d5f46969d43a4adabacf88f9240d92cfe5fcba30f300d6dd002619497', 'unknown_pre_ledger', 'backfill_assumed'),
  ('063_add_input_type_to_options.sql', '7594ef9b9ecd4e11140d2570d1b1e5a586c67cdffea58bfcbaf7ad75b76ac835', 'unknown_pre_ledger', 'backfill_assumed'),
  ('064_association_pool_survey_permit_persistence.sql', '83e310303dec94c835e3d32037f05a84b19178eb8dc1a98fb9181bd6be5f45a4', 'unknown_pre_ledger', 'backfill_assumed'),
  ('065_vendor_storage_select_leg_for_assigned_projects.sql', 'a2eb9057407e8e28cf705ca612678e8d6d96b07204dcb5f1c7fbd11bf7661056', 'unknown_pre_ledger', 'backfill_assumed'),
  ('066_sent_projects_work_started_at.sql', '2025993a358315fec86f470df5435c0beb64d3b2572ee8398591f831a6902a45', 'unknown_pre_ledger', 'backfill_assumed'),
  ('067_homeowner_documents_doc_type_association_permit.sql', '5726826e16280973cf24933a6b0c2eb01bb9f1e65c97de3c1127c155b51008eb', 'unknown_pre_ledger', 'backfill_assumed'),
  ('068_vendor_service_rates.sql', 'e8fa5173c28e8dc3d3cfee2c5a842d66f6b69cbd62eb108198e6e2bda2d88652', 'unknown_pre_ledger', 'backfill_assumed'),
  ('069_stripe_connect_express.sql', '11a4dd884660fd20eaeccbe3aa971ec2787235fa868c79dd56ac29865aef41ab', 'unknown_pre_ledger', 'backfill_assumed'),
  ('071_vendor_financing.sql', '539a96c1a65419e53f0258b847571c0211a06f56e22c8b299c1db130c0bb97c0', 'unknown_pre_ledger', 'backfill_assumed'),
  ('072_referral_program_core.sql', '6d716b9e120b6e3d8c99d5ed378f7c84c7e2e1dab1492730b889bcaabfd1d828', 'unknown_pre_ledger', 'backfill_assumed'),
  ('088_repoint_messages_to_sent_projects.sql', 'f6b3901224f343a4795fdfbe98b9d7b1a067c1ea673f16af723e9e4db16b49ca', 'unknown_pre_ledger', 'backfill_assumed'),
  ('089_support_threads_messages.sql', 'bf84dc4df4ec3a501ff31afe695ece79d7cf3460b08aab899ab1a46c61584c49', 'unknown_pre_ledger', 'backfill_assumed'),
  ('090_lenders_seed_slice_fastlane_and_credit_unions_flag.sql', 'eae6882d13e4a513690fce92960421ee5a46379105d514f84d04e63f1bb8a387', 'unknown_pre_ledger', 'backfill_assumed'),
  ('091_vendor_storage_insert_path_derived_predicate.sql', '61b5675f249f8c039719f42541bb39d171c1b0063a09c980ce32bea8bff1dffa', 'unknown_pre_ledger', 'backfill_assumed'),
  ('092_platform_settings_show_margin_on_project_report.sql', '745c0d8b6eb7663c544be967d556154ce686a40891ba432c19151817e20e3860', 'unknown_pre_ledger', 'backfill_assumed'),
  ('093_homeowner_documents_insert_system_project_report.sql', '485db1ed6172e3eb2b032cad372a0aa7e94ee01396a5229ace2bc936b2089cdd', 'unknown_pre_ledger', 'backfill_assumed'),
  ('094_homeowner_documents_doc_type_project_report.sql', '6917c81253a04b796acac2da02c1fd9dd7684b9042289b7d7d452e3b7599bd61', 'unknown_pre_ledger', 'backfill_assumed'),
  ('095_payment_methods_real_stripe.sql', '7a099994a6953b432c59db5cfe9601fe0db7dd9a51cb4ad562334d5a4e51c44b', 'unknown_pre_ledger', 'backfill_assumed'),
  ('096_vendor_option_prices_percent_bp.sql', '078e3280c98d97d7d870149c2e71d3369ad2821c187a064a9e599e28f303d1a1', 'unknown_pre_ledger', 'backfill_assumed'),
  ('097_vendor_sub_option_prices_percent_bp.sql', 'eae84208b9e31b8d61174193183d82a9f8c91cb33df5bc8789578735372eaf19', 'unknown_pre_ledger', 'backfill_assumed'),
  ('098_avatars_storage_path_and_moderation_status.sql', '597f3fadec851ff4ac505c154107a74132676222476789f05757475f406a103f', 'unknown_pre_ledger', 'backfill_assumed'),
  ('099_add_admin_employee_role.sql', 'db7c5c2feddfcf0630af75719490a9ff28e3670513b29dd12eee2f611ad31834', 'unknown_pre_ledger', 'backfill_assumed'),
  ('100_concierge_rep_role.sql', '1342b34bffedb611f1a0466af35263f9ebc011c1173b1944b02e6dbba337ae3a', 'unknown_pre_ledger', 'backfill_assumed'),
  ('101_concierge_rep_requests.sql', '12351325e3142df6a3e67320b467c07ea4bb7e2ed9f1f36f34f71b5c2358f2f9', 'unknown_pre_ledger', 'backfill_assumed'),
  ('102_concierge_rep_request_events.sql', '3480bda045cb51bc88d04a0c266a658fea351becda7db8baff8abd1a0cfeae1f', 'unknown_pre_ledger', 'backfill_assumed'),
  ('103_concierge_rep_request_photos_storage.sql', '42702bb6b5a7147c39a1f8a27ff600005b4db466607bfbe131f07dae1a491a4e', 'unknown_pre_ledger', 'backfill_assumed'),
  ('104_concierge_rep_request_photos.sql', 'd164e6524d9c489713d9bc5bb3b46570acf9daa449bf747b37ba3673874329eb', 'unknown_pre_ledger', 'backfill_assumed'),
  ('105_concierge_rep_request_transitions.sql', 'f79d2e69cc32ce2c7cad12125d9bbf05512938ee77c63c9f194a15b38d9ff0cd', 'unknown_pre_ledger', 'backfill_assumed'),
  ('106_concierge_realtime_publication.sql', 'a5014fd3d8fac62afdc05a3aba3460bb9cad6becb98f5873c98564867530d0f7', 'unknown_pre_ledger', 'backfill_assumed'),
  ('107_admin_employee_profiles_select_parity.sql', 'cfe6042bcbdac951f1c85efe8185bd2f18d42d1d3091e1a66ab2887096a4229f', 'unknown_pre_ledger', 'backfill_assumed'),
  ('112_escrow_accounts_external_account_brand.sql', '977095e3b31ae0d65afa9a18a06e8b8cd8218b83e32fe4f8e7e0fa8337c5e09b', 'unknown_pre_ledger', 'backfill_assumed'),
  ('113_column_gate_platform_app_settings.sql', '52bdb4d781bf6c0472d7bfe0bd75071494f2b1b5a8b0bba64ccc18dec8d5103a', 'unknown_pre_ledger', 'backfill_assumed'),
  ('114_sent_projects_revision_request.sql', '92b897bcf6b8e424995d99b41161a45e95aff90a9747655961be76ea3fe58478', 'unknown_pre_ledger', 'backfill_assumed'),
  ('115_profiles_financing_available.sql', '187ff8b296ef3ef8048d63ed871ed8422e3d53b1e330061a1cb0af014eab7a7c', 'unknown_pre_ledger', 'backfill_assumed'),
  ('116_kitchen_5_step_restructure.sql', '3faafda05c7fa66da760556b671bc674eda5f2617dbacc818b967ef75fc741f1', 'unknown_pre_ledger', 'backfill_assumed'),
  ('119_roofing_addon_image_url.sql', '97e9dead6c5a0b972dfaa007e51685c1bda18a5d719c3b73c682c428488e415a', 'unknown_pre_ledger', 'backfill_assumed'),
  ('120_profiles_folio.sql', 'd3a81e03d218c740df15afd87833e47fe4362fc175c7a6663b6370e54aaa4096', 'unknown_pre_ledger', 'backfill_assumed'),
  ('121_catalog_image_urls_batch1.sql', '6cb9e663b0b73f21f17eacf3d2b9884693a8eb37aac089af18f3518186795379', 'unknown_pre_ledger', 'backfill_assumed'),
  ('122_catalog_image_urls_gap2.sql', '1ccb59f818a9fb9c162b0d5318b10012776d32939d0f81ff0108fdc32dae9bff', 'unknown_pre_ledger', 'backfill_assumed'),
  ('123_catalog_image_urls_windows_doors.sql', '495a1748caac2fa5e0fc1563663d4d85e2233dba2edc5d4f6dcbac0f4e14a48d', 'unknown_pre_ledger', 'backfill_assumed'),
  ('124_catalog_image_urls_kitchen_quartz.sql', '5f1e6665e16ac9531510d5002adead662f4d0bbe56923d2fe18cf3b82b989fcd', 'unknown_pre_ledger', 'backfill_assumed'),
  ('125_catalog_image_urls_blinds_fabric.sql', '8b50d5777a3982e51922379892fbf8e8f5e935f12f46560aa2cb68e294c89ed8', 'unknown_pre_ledger', 'backfill_assumed'),
  ('126_options_rename_stone_install_cabinet_install.sql', '72f911f8546ac0512d81bce5986e98ff9954b81c8867155248c0ba984f802327', 'unknown_pre_ledger', 'backfill_assumed')
on conflict (filename) do nothing;

-- LEDGER FOOTER BOUNDARY BELOW
insert into public.applied_migrations (filename, content_sha256, applied_by, provenance)
values ('128_applied_migrations_backfill_seed.sql', '937e21d90813ac05cb13b54b49f4b907405fe7f8f1e38f00fc1f8e6c9a9607d9', current_setting('app.agent_id'), 'apply');

commit;
