export interface DiscordGuild {
    id: string;
    name: string;
}

export interface DiscordChannel {
    id: string;
    name: string;
}

export interface DiscordEvent {
    id: string;
    guild_id: string;
    channel_id: string | null;
    creator_id?: string;
    name: string;
    description?: string;
    scheduled_start_time: string;
    scheduled_end_time: string | null;
    privacy_level: number;
    status: number;
    entity_type: number;
    entity_id: string | null;
    entity_metadata: {
        location?: string;
    } | null;
    creator?: {
        id: string;
        username: string;
        discriminator: string;
    };
    user_count?: number;
    image?: string | null;
    recurrence_rule: {
        start: string;
        end?: string | null;
        frequency: number;
        interval: number;
        by_weekday?: number[] | null;
        by_n_weekday?: number[] | null;
        by_month?: number[] | null;
        by_month_day?: number[] | null;
        by_year_day?: number[] | null;
        count?: number | null;
    } | null;
    guild_scheduled_event_exceptions?: DiscordEventException[];
}

export interface DiscordEventException {
    event_exception_id: string;
    event_id: string;
    guild_id: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    is_canceled: boolean;
}
