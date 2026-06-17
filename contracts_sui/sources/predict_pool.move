module aura::predict_pool {
    use sui::object::{Self, UID};
    use sui::coin::{Coin};
    use sui::tx_context::TxContext;
    use sui::transfer;

    public struct Pool has key, store {
        id: UID,
    }

    /// Public entry function to initialize the mock pool.
    public fun create_pool(ctx: &mut TxContext) {
        let pool = Pool {
            id: object::new(ctx),
        };
        transfer::share_object(pool);
    }

    /// Mock of the DeepBook Predict mint_range method.
    /// Simply takes the deposited coin and returns it back to satisfy the PTB requirements.
    public fun mint_range<T>(
        _pool: &mut Pool,
        coin: Coin<T>,
        _oracle_id: address,
        _expiry: u64,
        _lower_strike: u64,
        _higher_strike: u64,
        _ctx: &mut TxContext,
    ): Coin<T> {
        coin
    }

    /// Fallback mock matching the TS SDK fallback path.
    public fun mint_range_mock<T>(
        _pool: &mut Pool,
        coin: Coin<T>,
        _oracle_id: address,
        _expiry: u64,
        _lower_strike: u64,
        _higher_strike: u64,
        _ctx: &mut TxContext,
    ): Coin<T> {
        coin
    }
}
