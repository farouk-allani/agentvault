#[test_only]
module agentvault::vault_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};

    use agentvault::vault::{Self, Vault};

    // Test addresses
    const OWNER: address = @0xA;
    const AGENT: address = @0xB;
    const RECIPIENT: address = @0xC;

    // Test constants
    const INITIAL_BALANCE: u64 = 1_000_000_000; // 1000 USDC
    const DAILY_LIMIT: u64 = 100_000_000;       // 100 USDC
    const PER_TX_LIMIT: u64 = 10_000_000;       // 10 USDC
    const ALERT_THRESHOLD: u64 = 50_000_000;    // 50 USDC

    fun setup_test(): Scenario {
        ts::begin(OWNER)
    }

    fun create_test_coin(scenario: &mut Scenario, amount: u64): Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, ts::ctx(scenario))
    }

    fun create_test_clock(scenario: &mut Scenario): Clock {
        clock::create_for_testing(ts::ctx(scenario))
    }

    #[test]
    fun test_create_vault() {
        let mut scenario = setup_test();

        // Create vault
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE);
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,  // yield_enabled
                1_000_000, // min_balance
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Verify vault was created
        ts::next_tx(&mut scenario, OWNER);
        {
            let vault = ts::take_shared<Vault<SUI>>(&scenario);

            assert!(vault::get_balance(&vault) == INITIAL_BALANCE, 0);
            assert!(vault::get_owner(&vault) == OWNER, 1);
            assert!(vault::get_agent(&vault) == AGENT, 2);
            assert!(vault::get_daily_limit(&vault) == DAILY_LIMIT, 3);
            assert!(vault::get_per_tx_limit(&vault) == PER_TX_LIMIT, 4);
            assert!(!vault::is_paused(&vault), 5);

            ts::return_shared(vault);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_execute_payment() {
        let mut scenario = setup_test();

        // Create vault
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE);
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,
                1_000_000,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Execute payment as agent
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
            let clock = create_test_clock(&mut scenario);

            let payment_amount: u64 = 5_000_000; // 5 USDC

            vault::execute_payment<SUI>(
                &mut vault,
                RECIPIENT,
                payment_amount,
                &clock,
                ts::ctx(&mut scenario)
            );

            assert!(vault::get_balance(&vault) == INITIAL_BALANCE - payment_amount, 0);
            assert!(vault::get_spent_today(&vault) == payment_amount, 1);
            assert!(vault::get_tx_count(&vault) == 1, 2);

            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = vault::EExceedsPerTxLimit)]
    fun test_payment_exceeds_per_tx_limit() {
        let mut scenario = setup_test();

        // Create vault
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE);
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,
                1_000_000,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Try to exceed per-tx limit
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
            let clock = create_test_clock(&mut scenario);

            // Try to pay more than per-tx limit
            vault::execute_payment<SUI>(
                &mut vault,
                RECIPIENT,
                PER_TX_LIMIT + 1,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = vault::ENotAgent)]
    fun test_payment_not_agent() {
        let mut scenario = setup_test();

        // Create vault
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE);
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,
                1_000_000,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Try to pay as non-agent (OWNER)
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
            let clock = create_test_clock(&mut scenario);

            vault::execute_payment<SUI>(
                &mut vault,
                RECIPIENT,
                1_000_000,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_pause_vault() {
        let mut scenario = setup_test();

        // Create vault
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE);
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,
                1_000_000,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Pause vault
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault<SUI>>(&scenario);

            vault::set_paused(&mut vault, true, ts::ctx(&mut scenario));
            assert!(vault::is_paused(&vault), 0);

            ts::return_shared(vault);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_deposit() {
        let mut scenario = setup_test();

        // Create vault
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE);
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,
                1_000_000,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Deposit more funds
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
            let deposit_amount: u64 = 500_000_000;
            let deposit_coin = create_test_coin(&mut scenario, deposit_amount);

            vault::deposit(&mut vault, deposit_coin, ts::ctx(&mut scenario));

            assert!(vault::get_balance(&vault) == INITIAL_BALANCE + deposit_amount, 0);

            ts::return_shared(vault);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_withdraw() {
        let mut scenario = setup_test();

        // Create vault
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE);
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,
                1_000_000,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Withdraw funds
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
            let withdraw_amount: u64 = 200_000_000;

            vault::withdraw(&mut vault, withdraw_amount, ts::ctx(&mut scenario));

            assert!(vault::get_balance(&vault) == INITIAL_BALANCE - withdraw_amount, 0);

            ts::return_shared(vault);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = vault::EBelowMinBalance)]
    fun test_payment_below_min_balance() {
        let mut scenario = setup_test();
        
        // Test constants: 1000 USDC balance, 1 USDC min_balance
        // Payment that would leave balance below min_balance should fail
        let min_balance: u64 = 100_000_000; // 100 USDC min balance

        // Create vault with high min_balance
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE); // 1000 USDC
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,
                min_balance, // 100 USDC min balance
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Try to pay amount that would leave balance below min_balance
        // Balance: 1000 USDC, trying to pay 950 USDC, would leave 50 USDC < 100 USDC min
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
            let clock = create_test_clock(&mut scenario);

            let payment_amount: u64 = 950_000_000; // 950 USDC - would leave only 50 USDC

            vault::execute_payment<SUI>(
                &mut vault,
                RECIPIENT,
                payment_amount,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_payment_respects_min_balance() {
        let mut scenario = setup_test();
        
        let min_balance: u64 = 100_000_000; // 100 USDC min balance

        // Create vault with min_balance
        ts::next_tx(&mut scenario, OWNER);
        {
            let coin = create_test_coin(&mut scenario, INITIAL_BALANCE); // 1000 USDC
            let clock = create_test_clock(&mut scenario);

            vault::create_vault<SUI>(
                coin,
                AGENT,
                DAILY_LIMIT,
                PER_TX_LIMIT,
                ALERT_THRESHOLD,
                true,
                min_balance,
                &clock,
                ts::ctx(&mut scenario)
            );

            clock::destroy_for_testing(clock);
        };

        // Pay amount that respects min_balance
        // Balance: 1000 USDC, pay 5 USDC, leaves 995 USDC > 100 USDC min
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault<SUI>>(&scenario);
            let clock = create_test_clock(&mut scenario);

            let payment_amount: u64 = 5_000_000; // 5 USDC

            vault::execute_payment<SUI>(
                &mut vault,
                RECIPIENT,
                payment_amount,
                &clock,
                ts::ctx(&mut scenario)
            );

            // Verify payment succeeded and balance is above min
            assert!(vault::get_balance(&vault) == INITIAL_BALANCE - payment_amount, 0);
            assert!(vault::get_balance(&vault) >= min_balance, 1);

            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
        };

        ts::end(scenario);
    }
}
