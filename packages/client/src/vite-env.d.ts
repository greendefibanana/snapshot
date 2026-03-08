/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly SNAP_AUTHORITY_BACKEND?: 'local' | 'magicblock';
    readonly MAGICBLOCK_RPC_URL?: string;
    readonly SOLANA_RPC_URL?: string;
    readonly SNAP_AUTHORITY_PROGRAM_ID?: string;
    readonly VITE_SNAP_AUTHORITY_PROGRAM_ID?: string;
    readonly SNAP_MATCH_SEED_HEX?: string;
    readonly MAGIC_ROUTER_URL?: string;
    readonly VITE_MAGIC_ROUTER_URL?: string;
    readonly MAGIC_PROGRAM_ID?: string;
    readonly VITE_MAGIC_PROGRAM_ID?: string;
    readonly MAGIC_CONTEXT_ID?: string;
    readonly VITE_MAGIC_CONTEXT_ID?: string;
    readonly MAGIC_CONTEXT_PUBKEY?: string;
    readonly VITE_MAGIC_CONTEXT_PUBKEY?: string;
    readonly MAGICBLOCK_VALIDATOR_ID?: string;
    readonly VITE_MAGICBLOCK_VALIDATOR_ID?: string;
    readonly SNAP_MB_DELEGATION_PROGRAM_ID?: string;
    readonly VITE_SNAP_MB_DELEGATION_PROGRAM_ID?: string;
    readonly SNAP_POLL_HZ?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
