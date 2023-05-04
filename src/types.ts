import { EventEmitter2, ConstructorOptions } from 'eventemitter2'
import type { StrictEventEmitter } from 'strict-event-emitter-types'


// Optional derived class if we need it (if we have nothing to add we can just us EventEmitter directly
// (EventEmitter2 as { new(): StrictEventEmitter<EventEmitter2, any, any> }) {
class TypedEventEmitterImpl extends (EventEmitter2 as new () => StrictEventEmitter<EventEmitter2, any, any>) {}

// Define the actual constructor, we need to use a type assertion to make the `EventEmitter` fit  in here
export const TypedEventEmitter: new <T, K = T>(options?: ConstructorOptions) => StrictEventEmitter<
EventEmitter2,
T,
K
> = TypedEventEmitterImpl as any

// Define the type for our emitter
export type TypedEventEmitter<T, K = T> = StrictEventEmitter<EventEmitter2, T, K> // Order matters here, we want our overloads to be considered first

export type Arguments<T> = [T] extends [(...args: infer U) => any] ? U : [T] extends [void] ? [] : [T]

export type U2I<U> = (U extends U ? (arg: U) => 0 : never) extends (arg: infer I) => 0 ? I : never

// For homogeneous unions, it picks the last member
type OneOf<U> = U2I<U extends U ? (x: U) => 0 : never> extends (x: infer L) => 0 ? L : never

export type U2T<U, L = OneOf<U>> = [U] extends [never] ? [] : [...U2T<Exclude<U, L>>, L]

export type ListType<L> = L extends Array<infer R> ? R : never
