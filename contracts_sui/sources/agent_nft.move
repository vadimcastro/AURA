/// Module: agent_nft
///
/// Enables packaging autonomous trading strategies and agent reputations into
/// transferable, tradeable NFTs using Sui's native Kiosk standard.
module aura::agent_nft {
    use std::string::{Self, String};
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::kiosk::{Self, Kiosk, KioskOwnerCap};
    use aura::aura_registry::{Self, Registry};

    // ── Error Codes ──────────────────────────────────────────────────────────

    const EAgentInactive: u64 = 0;

    // ── Structs ───────────────────────────────────────────────────────────────

    /// The Agent Strategy NFT, which represents an active trading agent.
    public struct AgentNFT has key, store {
        id: UID,
        /// The operator address of the agent in the registry
        agent_address: address,
        /// Public name of the strategy
        name: String,
        /// Description of the strategy parameters and risk profile
        description: String,
        /// Type of strategy (e.g. "Arbitrage", "Grid", "Trend Following")
        strategy_type: String,
        /// Snapshot of reputation score at the time of minting/updating
        reputation_score: u64,
        /// Public metadata or display image URL
        image_url: String,
        /// LLM model used for trade execution decisions
        executor_model: String,
        /// LLM panel used for off-loop strategy consensus updates
        consensus_model: String,
    }

    // ── Events ────────────────────────────────────────────────────────────────

    public struct AgentNFTMinted has copy, drop {
        nft_id: ID,
        agent_address: address,
        name: String,
        reputation_score: u64,
    }

    // ── Public Functions ──────────────────────────────────────────────────────

    /// Mint an Agent Strategy NFT representing an active agent.
    /// Can only be called by a registered and active agent operator (sender).
    public fun mint_nft(
        registry: &Registry,
        name: vector<u8>,
        description: vector<u8>,
        strategy_type: vector<u8>,
        image_url: vector<u8>,
        executor_model: vector<u8>,
        consensus_model: vector<u8>,
        ctx: &mut TxContext
    ): AgentNFT {
        let sender = ctx.sender();
        // Verify that the sender is an active agent in the registry
        assert!(aura_registry::is_agent_active(registry, sender), EAgentInactive);

        let reputation_score = aura_registry::get_reputation_score(registry, sender);

        let id = object::new(ctx);
        let nft_id = object::uid_to_inner(&id);

        let name_str = string::utf8(name);
        let description_str = string::utf8(description);
        let strategy_str = string::utf8(strategy_type);
        let image_str = string::utf8(image_url);
        let executor_str = string::utf8(executor_model);
        let consensus_str = string::utf8(consensus_model);

        let nft = AgentNFT {
            id,
            agent_address: sender,
            name: name_str,
            description: description_str,
            strategy_type: strategy_str,
            reputation_score,
            image_url: image_str,
            executor_model: executor_str,
            consensus_model: consensus_str,
        };

        event::emit(AgentNFTMinted {
            nft_id,
            agent_address: sender,
            name: name_str,
            reputation_score,
        });

        nft
    }

    /// Mint an Agent NFT and transfer it directly to the sender.
    public entry fun mint_and_keep(
        registry: &Registry,
        name: vector<u8>,
        description: vector<u8>,
        strategy_type: vector<u8>,
        image_url: vector<u8>,
        executor_model: vector<u8>,
        consensus_model: vector<u8>,
        ctx: &mut TxContext
    ) {
        let nft = mint_nft(registry, name, description, strategy_type, image_url, executor_model, consensus_model, ctx);
        transfer::public_transfer(nft, ctx.sender());
    }

    /// Mint an Agent NFT, create a new Kiosk, place the NFT inside it,
    /// and transfer the Owner Capability to the operator while sharing the Kiosk object.
    public entry fun create_kiosk_and_place(
        registry: &Registry,
        name: vector<u8>,
        description: vector<u8>,
        strategy_type: vector<u8>,
        image_url: vector<u8>,
        executor_model: vector<u8>,
        consensus_model: vector<u8>,
        ctx: &mut TxContext
    ) {
        let nft = mint_nft(registry, name, description, strategy_type, image_url, executor_model, consensus_model, ctx);
        let (mut kiosk, cap) = kiosk::new(ctx);
        kiosk::place(&mut kiosk, &cap, nft);
        
        transfer::public_share_object(kiosk);
        transfer::public_transfer(cap, ctx.sender());
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    public fun get_nft_agent_address(nft: &AgentNFT): address {
        nft.agent_address
    }

    public fun get_nft_name(nft: &AgentNFT): String {
        nft.name
    }

    public fun get_nft_reputation_score(nft: &AgentNFT): u64 {
        nft.reputation_score
    }

    public fun get_nft_executor_model(nft: &AgentNFT): String {
        nft.executor_model
    }

    public fun get_nft_consensus_model(nft: &AgentNFT): String {
        nft.consensus_model
    }

    // ── Unit Tests ────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario::{Self as ts};
    #[test_only]
    use sui::coin;
    #[test_only]
    use sui::sui::SUI;

    #[test_only]
    const ADMIN: address = @0xAD;
    #[test_only]
    const AGENT1: address = @0xA1;
    #[test_only]
    const MIN_STAKE: u64 = 100_000_000;

    #[test]
    fun test_mint_nft_success() {
        let mut scenario = ts::begin(ADMIN);
        {
            aura_registry::init_for_testing(ts::ctx(&mut scenario));
        };

        // Register AGENT1
        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            aura_registry::register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        // Mint Agent NFT
        ts::next_tx(&mut scenario, AGENT1);
        {
            let registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let nft = mint_nft(
                &registry,
                b"Alpha Arbitrage",
                b"High-frequency arbitrage strategy",
                b"Arbitrage",
                b"https://aura.protocol/images/alpha.png",
                b"google/gemma-4-26b-a4b:free",
                b"Consensus Trio (Nemotron, Qwen3, Llama3.3)",
                ctx
            );

            assert!(nft.agent_address == AGENT1, 0);
            assert!(nft.name == string::utf8(b"Alpha Arbitrage"), 0);
            assert!(nft.strategy_type == string::utf8(b"Arbitrage"), 0);
            // Reputation score should match initial 50%
            assert!(nft.reputation_score == 500_000, 0);
            assert!(nft.executor_model == string::utf8(b"google/gemma-4-26b-a4b:free"), 0);
            assert!(nft.consensus_model == string::utf8(b"Consensus Trio (Nemotron, Qwen3, Llama3.3)"), 0);

            transfer::public_transfer(nft, AGENT1);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = EAgentInactive)]
    fun test_mint_nft_inactive_fails() {
        let mut scenario = ts::begin(ADMIN);
        {
            aura_registry::init_for_testing(ts::ctx(&mut scenario));
        };

        // AGENT1 is not registered, so should fail to mint NFT
        ts::next_tx(&mut scenario, AGENT1);
        {
            let registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let nft = mint_nft(
                &registry,
                b"Alpha Arbitrage",
                b"High-frequency arbitrage strategy",
                b"Arbitrage",
                b"https://aura.protocol/images/alpha.png",
                b"google/gemma-4-26b-a4b:free",
                b"Consensus Trio (Nemotron, Qwen3, Llama3.3)",
                ctx
            );
            transfer::public_transfer(nft, AGENT1);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    #[test]
    fun test_create_kiosk_and_place() {
        let mut scenario = ts::begin(ADMIN);
        {
            aura_registry::init_for_testing(ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            aura_registry::register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            create_kiosk_and_place(
                &registry,
                b"Kiosk Strategy",
                b"Placed directly inside Kiosk",
                b"Arbitrage",
                b"https://aura.protocol/images/kiosk.png",
                b"google/gemma-4-26b-a4b:free",
                b"Consensus Trio (Nemotron, Qwen3, Llama3.3)",
                ctx
            );
            ts::return_shared(registry);
        };

        // Verify Kiosk and KioskOwnerCap are created and transferred
        ts::next_tx(&mut scenario, AGENT1);
        {
            let kiosk = ts::take_shared<Kiosk>(&scenario);
            let owner_cap = ts::take_from_sender<KioskOwnerCap>(&scenario);

            ts::return_shared(kiosk);
            ts::return_to_sender(&scenario, owner_cap);
        };

        ts::end(scenario);
    }
}
