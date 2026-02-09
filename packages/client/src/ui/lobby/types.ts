export enum TokenType {
    COLOR = 'COLOR',
    TYPOGRAPHY = 'TYPOGRAPHY',
    BUTTON = 'BUTTON',
    CARD = 'CARD',
    EFFECT = 'EFFECT'
}

export interface Player {
    id: string;
    name: string;
    avatar: string;
    level: number;
    ready: boolean;
    weapon: string;
}

export enum Tab {
    TOKENS = 'TOKENS',
    LOBBY = 'LOBBY'
}