/**
 * Typed D1-backed bot flows (replacements for in-memory Maps).
 */
import {
    BOT_FLOWS,
    clearFlowSession,
    getFlowState,
    setFlowState,
    startExclusiveFlow,
    type FlowState,
} from './flowSession';

// --- Order ---

export type OrderStep = 'select_category' | 'select_service' | 'enter_link' | 'enter_quantity';

export interface OrderFlowData {
    categoryId?: number;
    categoryName?: string;
    serviceId?: number;
    serviceName?: string;
    serviceType?: string;
    serviceMin?: number;
    serviceMax?: number;
    link?: string;
    categoryPage?: number;
    servicePage?: number;
}

export type OrderFlowState = FlowState<OrderFlowData> & { step: OrderStep };

export async function getOrderFlow(db: D1Database, chatId: number) {
    return getFlowState<OrderFlowData>(db, chatId, BOT_FLOWS.ORDER) as Promise<OrderFlowState | null>;
}

export async function setOrderFlow(db: D1Database, chatId: number, state: OrderFlowState) {
    return setFlowState(db, chatId, BOT_FLOWS.ORDER, state);
}

export async function clearOrderFlow(db: D1Database, chatId: number) {
    return clearFlowSession(db, chatId, BOT_FLOWS.ORDER);
}

export async function startOrderFlow(db: D1Database, chatId: number, state: OrderFlowState) {
    return startExclusiveFlow(db, chatId, BOT_FLOWS.ORDER, state);
}

// --- Payment ---

export type PaymentStep = 'method' | 'crypto_network' | 'amount' | 'receipt' | 'crypto_waiting';

export interface PaymentFlowData {
    methodId?: number;
    methodName?: string;
    cardNumber?: string;
    cardHolder?: string;
    minAmount?: number;
    maxAmount?: number;
    amount?: number;
    isCrypto?: boolean;
    networkId?: string;
    localPaymentId?: number;
}

export type PaymentFlowState = FlowState<PaymentFlowData> & { step: PaymentStep };

export async function getPaymentFlow(db: D1Database, chatId: number) {
    return getFlowState<PaymentFlowData>(db, chatId, BOT_FLOWS.PAYMENT) as Promise<PaymentFlowState | null>;
}

export async function setPaymentFlow(db: D1Database, chatId: number, state: PaymentFlowState) {
    return setFlowState(db, chatId, BOT_FLOWS.PAYMENT, state);
}

export async function clearPaymentFlow(db: D1Database, chatId: number) {
    return clearFlowSession(db, chatId, BOT_FLOWS.PAYMENT);
}

export async function startPaymentFlow(db: D1Database, chatId: number, state: PaymentFlowState) {
    return startExclusiveFlow(db, chatId, BOT_FLOWS.PAYMENT, state);
}

// --- AI chat ---

export type AiStep = 'waiting_question';

export interface AiFlowData {}

export type AiFlowState = FlowState<AiFlowData> & { step: AiStep };

export async function getAiFlow(db: D1Database, chatId: number) {
    return getFlowState<AiFlowData>(db, chatId, BOT_FLOWS.AI_CHAT) as Promise<AiFlowState | null>;
}

export async function setAiFlow(db: D1Database, chatId: number, state: AiFlowState) {
    return setFlowState(db, chatId, BOT_FLOWS.AI_CHAT, state);
}

export async function clearAiFlow(db: D1Database, chatId: number) {
    return clearFlowSession(db, chatId, BOT_FLOWS.AI_CHAT);
}

export async function startAiFlow(db: D1Database, chatId: number) {
    return startExclusiveFlow(db, chatId, BOT_FLOWS.AI_CHAT, { step: 'waiting_question' });
}

// --- My orders (re-export helpers used by router) ---

export type MyOrdersStep = 'list' | 'detail';

export interface MyOrdersFlowData {
    page: number;
    selectedOrderId?: number;
}

export type MyOrdersFlowState = FlowState<MyOrdersFlowData> & { step: MyOrdersStep };

export async function getMyOrdersFlow(db: D1Database, chatId: number) {
    return getFlowState<MyOrdersFlowData>(db, chatId, BOT_FLOWS.MY_ORDERS) as Promise<MyOrdersFlowState | null>;
}

export async function startMyOrdersFlow(db: D1Database, chatId: number, state: MyOrdersFlowState) {
    return startExclusiveFlow(db, chatId, BOT_FLOWS.MY_ORDERS, state);
}
