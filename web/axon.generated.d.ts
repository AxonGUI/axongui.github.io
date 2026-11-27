/**
 * 由 `axon-gui types` 生成，请勿手改。
 * schema v1
 */

export interface AxonRegistry {
  /** 窗口: AxonDocs */
  DemoController: {
    add(a: number, b: number): Promise<number>;
    asset_count(): Promise<number>;
    blob(size?: number): Promise<string>;
    broadcast(text: string): Promise<Array<any>>;
    call_js_mirror(payload: any): Promise<any>;
    cross_broadcast(text?: string): Promise<Record<string, any>>;
    cross_call(text?: string): Promise<any>;
    cross_close(): Promise<Array<string>>;
    cross_emit(text?: string): Promise<Array<string>>;
    cross_open(): Promise<Array<string>>;
    delayed(msg: string, ms?: number): Promise<string>;
    fail(reason?: string): Promise<null>;
    get_counter(): Promise<number>;
    get_pong(): Promise<Array<Array<any>>>;
    image(): Promise<string>;
    magic_gui(): Promise<boolean>;
    push_event(text: string): Promise<boolean>;
    read_js_value(): Promise<any>;
    slow(ms?: number): Promise<string>;
    store_read(key: string): Promise<any>;
    store_write(key: string, value: any): Promise<boolean>;
    stream(count?: number): Promise<Record<string, any>>;
    with_kwargs(a: number, b?: number, label?: string): Promise<Record<string, any>>;
    write_js_value(value: any): Promise<boolean>;
    /** 属性（读要 await，写走 setVar） */
    counter: number;
  };
}

declare module "axon-gui" {
  interface AxonControllers extends AxonRegistry {}
}
