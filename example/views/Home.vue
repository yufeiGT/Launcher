<template>
	<div class="home">首页</div>
</template>

<script lang="ts" setup>
import { Launcher } from '@~crazy/launcher';

const launcher = new Launcher({
	baseUrl: 'http://172.16.2.46:30866/auth',
	afterHandler(responseData, code) {
		console.log('调整结构前', responseData);
		const { data, message, dateTime, pagination, options } = responseData;
		responseData = {
			code,
			data,
			message,
			dateTime: dateTime || Date.now(),
			pagination,
			options
		}
		console.log('调整结构后', responseData);
		return responseData;
	}
});

// username: admin
// password: xao72mja2t
launcher
	.get('/oauth/get_token_password?grantType=password&username=admin&password=xao72mja2t')
	.then((res) => {
		console.log('请求成功', res);
	})
	.catch((err) => {
		console.error('请求失败', err);
	});
</script>

<style></style>
