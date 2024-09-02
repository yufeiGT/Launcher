<template>
	<div class="home">首页</div>
</template>

<script lang="ts" setup>
import { Launcher } from '@~crazy/launcher';

const launcher = new Launcher();

launcher
	.get('/')
	.then((res) => {
		console.log(res);
	})
	.catch((err) => {
		console.error(err);
	});
</script>

<style></style>
