module agentvault::events {
    use sui::event;
    use sui::object::ID;

    // === Events ===

    public struct VaultCreated has copy, drop {
        vault_id: ID,
        owner: address,
        agent: address,
        initial_balance: u64,
        daily_limit: u64,
        per_tx_limit: u64,
    }

    public struct PaymentExecuted has copy, drop {
        vault_id: ID,
        agent: address,
        recipient: address,
        amount: u64,
        spent_today: u64,
        remaining_daily: u64,
        tx_count: u64,
        timestamp: u64,
    }

    public struct AlertTriggered has copy, drop {
        vault_id: ID,
        owner: address,
        spent_today: u64,
        threshold: u64,
    }

    public struct ConstraintsUpdated has copy, drop {
        vault_id: ID,
        owner: address,
        daily_limit: u64,
        per_tx_limit: u64,
        alert_threshold: u64,
    }

    public struct VaultPaused has copy, drop {
        vault_id: ID,
        owner: address,
        paused: bool,
    }

    public struct FundsDeposited has copy, drop {
        vault_id: ID,
        depositor: address,
        amount: u64,
        new_balance: u64,
    }

    public struct FundsWithdrawn has copy, drop {
        vault_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    // === Emit Functions ===

    public fun emit_vault_created(
        vault_id: ID,
        owner: address,
        agent: address,
        initial_balance: u64,
        daily_limit: u64,
        per_tx_limit: u64,
    ) {
        event::emit(VaultCreated {
            vault_id, owner, agent, initial_balance, daily_limit, per_tx_limit,
        });
    }

    public fun emit_payment_executed(
        vault_id: ID,
        agent: address,
        recipient: address,
        amount: u64,
        spent_today: u64,
        remaining_daily: u64,
        tx_count: u64,
        timestamp: u64,
    ) {
        event::emit(PaymentExecuted {
            vault_id, agent, recipient, amount, spent_today,
            remaining_daily, tx_count, timestamp,
        });
    }

    public fun emit_alert_triggered(
        vault_id: ID,
        owner: address,
        spent_today: u64,
        threshold: u64,
    ) {
        event::emit(AlertTriggered { vault_id, owner, spent_today, threshold });
    }

    public fun emit_constraints_updated(
        vault_id: ID,
        owner: address,
        daily_limit: u64,
        per_tx_limit: u64,
        alert_threshold: u64,
    ) {
        event::emit(ConstraintsUpdated {
            vault_id, owner, daily_limit, per_tx_limit, alert_threshold,
        });
    }

    public fun emit_vault_paused(vault_id: ID, owner: address, paused: bool) {
        event::emit(VaultPaused { vault_id, owner, paused });
    }

    public fun emit_funds_deposited(
        vault_id: ID,
        depositor: address,
        amount: u64,
        new_balance: u64,
    ) {
        event::emit(FundsDeposited { vault_id, depositor, amount, new_balance });
    }

    public fun emit_funds_withdrawn(
        vault_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    ) {
        event::emit(FundsWithdrawn { vault_id, owner, amount, new_balance });
    }
}
