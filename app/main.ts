import { createApp } from 'vue';
import '@xterm/xterm/css/xterm.css';
import './styles/tailwind.css';
import './composables/useTheme';
import App from './App.vue';

createApp(App).mount('#app');
