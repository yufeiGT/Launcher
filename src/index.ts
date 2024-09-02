import { EventManager } from '@~crazy/eventmanager';
import * as Spanner from '@~crazy/spanner';

export interface EventMap {}

/**
 * 发射器
 */
export class Launcher<T extends EventMap = EventMap> extends EventManager<T> {
	constructor(options: Launcher.Options = {}) {
		super();
		const opts = Spanner.merge(
			true,
			{
				baseUrl: 'http://127.0.0.1',
				credentials: false,
				timeout: 1000 * 5,
				timeoutAgain: false,
				timeoutCount: 3,
			} as Launcher.Options,
			options
		);
		this.#options = opts;
		this.#authorization = options.authorization;
	}

	#options: Launcher.Options;
	/**
	 * 选项
	 */
	get options() {
		return this.#options;
	}

	#authorization: string = null;
	/**
	 * 用户令牌
	 */
	get authorization() {
		return this.#authorization;
	}

	/**
	 * 设置用户令牌
	 * @param authorization
	 */
	setAuthorization(authorization: string) {
		this.#authorization = authorization;
	}

	/**
	 * 清除用户令牌
	 */
	clearAuthorization() {
		this.#authorization = null;
	}

	/**
	 * 基础请求
	 * @param url 请求地址
	 * @param options 请求选项
	 * @param beforeHandler 请求前回调
	 * @returns
	 */
	base<T>(
		url: string,
		options: Launcher.RequestOptions<T> = {}
	): Promise<Launcher.Response<T>> {
		const { baseUrl, credentials, timeout, requestOptions } = this.options;
		const controller = new AbortController();
		if (Spanner.isFunction(this.options.beforeHandler)) {
			this.options.beforeHandler(controller);
		}
		if (Spanner.isFunction(options.beforeHandler)) {
			options.beforeHandler(controller);
		}
		const opts = Spanner.merge(
			true,
			{
				url,
				headers: {},
				timeout,
				timeoutCount: 1,
			} as Launcher.RequestOptions<T>,
			requestOptions as Launcher.RequestOptions<T>,
			options
		);
		if (this.authorization && opts.headers) {
			(opts.headers as any).Authorization = this.authorization;
		}
		opts.credentials = credentials ? 'include' : 'omit';
		opts.signal = controller.signal;
		return new Promise<Launcher.Response<T>>(
			(resolve, reject: (reason: Launcher.ResponseError<T>) => void) => {
				const timeoutID = setTimeout(() => {
					controller.abort();
					const again =
						this.options.timeoutAgain &&
						opts.timeoutCount < this.options.timeoutCount;
					if (!again) {
						this.#complete<T>(
							resolve,
							reject,
							500,
							new Error('Request timeout'),
							opts,
							true
						);
					}
					if (Spanner.isFunction(this.options.timeoutHandler)) {
						this.options.timeoutHandler(opts, again);
					}
					if (Spanner.isFunction(options.timeoutHandler)) {
						options.timeoutHandler(opts, again);
					}
					if (again) {
						opts.timeoutCount++;
						this.base<T>(url, opts)
							.then((res) => {
								resolve(res);
							})
							.catch((err) => {
								reject(err);
							});
					}
				}, timeout);
				fetch(`${baseUrl}${url}`, opts)
					.then(async (response) => {
						clearTimeout(timeoutID);
						const { status, statusText } = response;
						const responseText = await response.text();
						const responseData: Launcher.Response<T> = Launcher.getResponse<
							T
						>(status, statusText, responseText);
						this.#complete<T>(
							resolve,
							reject,
							status,
							responseData,
							opts
						);
					})
					.catch((e) => {
						if (e instanceof DOMException) {
							if (e.name === 'AbortError') {
								return;
							}
						}
						this.#complete<T>(resolve, reject, 500, e, opts, true);
						clearTimeout(timeoutID);
					});
			}
		);
	}

	/**
	 * GET 请求
	 * @param url 请求地址
	 * @param params 请求参数
	 * @param options 请求选项
	 * @param beforeHandler 请求前回调
	 * @returns
	 */
	get<T, U>(
		url: string,
		params: U | {} = {},
		options: Launcher.RequestOptions<T> = {}
	) {
		if (/^[^\?]+\?/.test(url)) {
			const [u, p] = url.split('?');
			url = u;
			p.split('&')
				.filter((item) => !!item)
				.forEach((item) => {
					const [key, value = ''] = item.split('=');
					if (!key || key in (params as object)) return;
					params[key] = value;
				});
		}
		let newParams = {};
		if (Spanner.isObject(this.options.globalParam)) {
			newParams = {
				...this.#options.globalParam,
			};
		}
		if (Spanner.isFunction(this.options.appendParams)) {
			const res = this.options.appendParams();
			if (Spanner.isObject(res)) {
				newParams = {
					...newParams,
					...res,
				};
			}
		}
		newParams = {
			...newParams,
			...params,
		};
		if (Object.keys(newParams).length) {
			let pStr = '';
			for (let [key, value] of Object.entries(newParams)) {
				pStr += `${key}=${value}&`;
			}
			url += `?${pStr.replace(/&$/, '')}`;
		}
		return this.base<T>(url, options);
	}

	/**
	 * POST 请求
	 * @param url 请求地址
	 * @param data 请求数据
	 * @param options 请求选项
	 * @param beforeHandler 请求前回调
	 * @returns
	 */
	post<T, U>(
		url: string,
		data: U | {} = {},
		options: Launcher.RequestOptions<T> = {}
	) {
		const opts = Spanner.merge(
			true,
			{
				// body: body as BodyInit,
				headers: {
					'Content-Type': 'application/json;charset=utf-8',
				},
				method: 'POST',
			},
			options
		);
		let newData = {};
		if (Spanner.isObject(this.options.globalParam)) {
			newData = {
				...this.#options.globalParam,
			};
		}
		if (Spanner.isFunction(this.options.appendParams)) {
			const res = this.options.appendParams();
			if (Spanner.isObject(res)) {
				newData = {
					...newData,
					...res,
				};
			}
		}
		newData = {
			...newData,
			...data,
		};
		let body = {};
		if (newData instanceof HTMLFormElement) {
			new FormData(newData).forEach((value, key) => (body[key] = value));
		} else {
			body = JSON.stringify(newData);
		}
		if (
			opts.headers['Content-Type'] === 'application/x-www-form-urlencoded'
		) {
			let bodyString = '';
			for (let i in body) {
				bodyString += `${i}=${body[i]}&`;
			}
			body = bodyString.replace(/&$/, '');
		}
		return this.base<T>(url, {
			body: body as BodyInit,
			...opts,
		});
	}

	/**
	 * 发送表单请求
	 * @param url 请求地址
	 * @param form 表单数据
	 * @param options 请求选项
	 * @param beforeHandler 请求前回调
	 * @returns
	 */
	form<T, U>(
		url: string,
		form: U | {} = {},
		options: Launcher.RequestOptions<T> = {}
	) {
		let body: FormData;
		if (!(form instanceof HTMLFormElement)) {
			body = new FormData();
			if (Spanner.isObject(form)) {
				for (let [key, value] of Object.entries(form)) {
					body.append(key, value);
				}
			}
		} else if (form instanceof FormData) {
			body = form;
		} else {
			body = new FormData(form);
		}
		return this.base<T>(url, {
			body,
			...options,
			method: 'POST',
		});
	}

	/**
	 * DELETE 请求
	 * @param url 请求地址
	 * @param params 请求参数
	 * @param options 请求选项
	 * @param beforeHandler 请求前回调
	 * @returns
	 */
	del<T, U>(
		url: string,
		params: U | {} = {},
		options: Launcher.RequestOptions<T>
	) {
		if (/^[^\?]+\?/.test(url)) {
			const [u, p] = url.split('?');
			url = u;
			p.split('&')
				.filter((item) => !!item)
				.forEach((item) => {
					const [key, value = ''] = item.split('=');
					if (!key || key in (params as any)) return;
					params[key] = value;
				});
		}
		if (Object.keys(params).length) {
			let pStr = '';
			for (let [key, value] of Object.entries(params)) {
				pStr += `${key}=${value}&`;
			}
			url += `?${pStr.replace(/&$/, '')}`;
		}
		return this.base<T>(url, {
			...options,
			method: 'DELETE',
		});
	}

	/**
	 * 请求完成
	 * @param resolve 请求成功钩子
	 * @param reject 请求失败钩子
	 * @param status 请求响应状态码
	 * @param response 请求响应
	 * @param options 请求选项
	 * @param fail 请求已失败
	 */
	#complete<T>(
		resolve: (response: Launcher.Response<T>) => void,
		reject: (reason: Launcher.ResponseError<T>) => void,
		status: number,
		response: Launcher.Response<T> | Launcher.ResponseError<T>,
		options: Launcher.RequestOptions<T>,
		fail: boolean = false
	): void {
		if (!fail) {
			if (this.#checkStatusCode(status)) {
				fail = true;
			} else {
				const { code } = response as Launcher.Response<T>;
				fail = this.#checkStatusCode(code);
			}
		}
		response.options = options;
		if (fail) {
			reject(response as Launcher.ResponseError<T>);
			if (Spanner.isFunction(this.options.fail)) {
				this.options.fail(response as Launcher.ResponseError<T>);
			}
		} else {
			resolve(response as Launcher.Response<T>);
			if (Spanner.isFunction(this.options.success)) {
				this.options.success(response as Launcher.Response<T>);
			}
		}
	}

	/**
	 * 检查状态码
	 * @param value
	 */
	#checkStatusCode(value: number) {
		switch (value) {
			case 200:
			case 201:
			case 204:
			case 304:
				return false;
			case 401:
			case 403:
				if (Spanner.isFunction(this.options.authHandler)) {
					this.options.authHandler(value);
				}
				return true;
			default:
				return true;
		}
	}

	/**
	 * 获取请求响应
	 * @param status 响应状态码
	 * @param statusText 响应消息
	 * @param responseText 响应内容
	 * @returns
	 */
	static getResponse<T>(
		status: number,
		statusText: string,
		responseText: string
	): Launcher.Response<T> {
		try {
			const response = JSON.parse(responseText);
			if ('result' in response) {
				response.code = response.result ? 200 : 500;
				response.message = response.errorMessage;
				response.data = response.returnValue;
			}
			return {
				code: status,
				message: statusText,
				...response,
			};
		} catch (e) {
			let data = null;
			try {
				data = JSON.parse(responseText);
			} catch (e) {}
			return {
				data: data as T,
				code: status,
				message: statusText,
			};
		}
	}

	/**
	 * 合并请求响应
	 * @param response 设置的请求响应
	 * @returns
	 */
	static mergeResponse<T>(
		response: Partial<Launcher.Response<T>> = {}
	): Launcher.Response<T> {
		return {
			data: {} as any,
			code: Launcher.ResponseCode.Success,
			message: Launcher.ResponseCode.getDescription(
				Launcher.ResponseCode.Success
			),
			dateTime: Date.now(),
			...response,
		};
	}
}
export namespace Launcher {
	/**
	 * 分页
	 */
	export interface Pagination {
		/**
		 * 数据总行数
		 */
		count: number;
		/**
		 * 当前页码
		 */
		index: number;
		/**
		 * 每页显示数量
		 */
		size: number;
	}
	export namespace Pagination {
		/**
		 * 请求参数
		 */
		export interface Params {
			/**
			 * 当前页码
			 */
			page: number;
			/**
			 * 每页显示数量
			 */
			pageSize: number;
		}
	}

	/**
	 * 请求选项
	 */
	export interface RequestOptions<T> extends RequestInit {
		/**
		 * 请求地址
		 */
		url?: string;
		/**
		 * 默认响应数据
		 */
		defaultResponse?: T;
		/**
		 * 超时次数
		 */
		timeoutCount?: number;
		/**
		 * 请求前回调
		 * @param controller 取消请求控制器
		 */
		beforeHandler?: (controller: AbortController) => void;
		/**
		 * 请求超时回调
		 * @param requestOptions 请求选项
		 * @param again 重新发起请求
		 */
		timeoutHandler?: (
			requestOptions: RequestOptions<T>,
			again: boolean
		) => void;
	}

	export enum ResponseCode {
		/**
		 * 请求成功
		 */
		Success = 200,
		/**
		 * 请求成功，数据已更新
		 */
		SuccessUpdate = 201,
		/**
		 * 请求成功，但无数据
		 */
		SuccessEmpty = 204,
		/**
		 * 请求成功，数据无更新
		 */
		SuccessNoChanged = 304,
		/**
		 * 请求参数错误
		 */
		ClientParamError = 400,
		/**
		 * 非法请求，用户未授权
		 */
		ClientUnauthorizedError = 401,
		/**
		 * 禁止访问，用户令牌无效
		 */
		ClientProhibitError = 403,
		/**
		 * 不存在此数据
		 */
		ClientNotFoundError = 404,
		/**
		 * 请求被拒绝
		 */
		ClientRefuseError = 405,
		/**
		 * 请求参数无效
		 */
		ClientInvalidParamError = 416,
		/**
		 * 服务器内部错误
		 */
		ServerInnerError = 500,
	}
	export namespace ResponseCode {
		/**
		 * 获取描述
		 * @param value 枚举值
		 */
		export function getDescription(value: ResponseCode) {
			switch (value) {
				case ResponseCode.Success:
					return '请求成功';
				case ResponseCode.SuccessUpdate:
					return '请求成功，数据已更新';
				case ResponseCode.SuccessEmpty:
					return '请求成功，但无数据';
				case ResponseCode.SuccessNoChanged:
					return '请求成功，数据无更新';
				case ResponseCode.ClientParamError:
					return '请求参数错误';
				case ResponseCode.ClientUnauthorizedError:
					return '非法请求，用户未授权';
				case ResponseCode.ClientProhibitError:
					return '禁止访问，用户令牌无效';
				case ResponseCode.ClientNotFoundError:
					return '不存在此数据';
				case ResponseCode.ClientRefuseError:
					return '请求被拒绝';
				case ResponseCode.ClientInvalidParamError:
					return '请求参数无效';
				case ResponseCode.ServerInnerError:
					return '服务器内部错误';
			}
		}
	}

	/**
	 * 请求响应内容
	 */
	export interface Response<T, C extends ResponseCode = ResponseCode> {
		/**
		 * 响应数据
		 */
		data?: T;
		/**
		 * 响应状态码
		 */
		code: C;
		/**
		 * 响应信息
		 */
		message: string;
		/**
		 * 请求数据产生的时间戳
		 */
		dateTime?: number;
		/**
		 * 分页数据
		 */
		pagination?: Pagination;
		/**
		 * 请求选项
		 */
		options?: RequestOptions<T>;
	}

	/**
	 * 请求错误信息
	 */
	export interface ResponseError<T = any> extends Error {
		/**
		 * 请求选项
		 */
		options?: RequestOptions<T>;
	}

	/**
	 * 发射器选项
	 */
	export interface Options {
		/**
		 * 请求根路径
		 * @default http://127.0.0.1
		 */
		baseUrl?: string;
		/**
		 * 全局参数
		 * 所有接口都发送这些参数
		 */
		globalParam?: Record<string, string | number>;
		/**
		 * 允许携带 cookie
		 * @default false
		 */
		credentials?: boolean;
		/**
		 * 用户令牌
		 */
		authorization?: string;
		/**
		 * 请求超时时间，毫秒
		 * @default 1000 * 5
		 */
		timeout?: number;
		/**
		 * 请求超时后再次发起请求
		 * @default false
		 */
		timeoutAgain?: boolean;
		/**
		 * 最大允许超时次数
		 * @default 3
		 */
		timeoutCount?: number;
		/**
		 * 请求选项
		 */
		requestOptions?: RequestOptions<any>;
		/**
		 * 请求附加参数回调
		 */
		appendParams?: () => {
			[propName: string]: string | number;
		};
		/**
		 * 请求前回调
		 * @param controller 取消请求控制器
		 */
		beforeHandler?: (controller: AbortController) => void;
		/**
		 * 验证失败回调
		 * @param code 状态码
		 */
		authHandler?: (code: number) => void;
		/**
		 * 请求成功回调
		 * @param response 响应数据
		 */
		success?: <T>(response: Response<T>) => void;
		/**
		 * 请求失败回调
		 * @param error 错误对象
		 */
		fail?: <T>(error?: ResponseError<T>) => void;
		/**
		 * 请求超时回调
		 * @param requestOptions 请求选项
		 * @param again 重新发起请求
		 */
		timeoutHandler?: (
			requestOptions: RequestOptions<any>,
			again: boolean
		) => void;
	}
}
