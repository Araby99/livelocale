// Lets site:typecheck (plain tsc) accept the theme's .vue imports; VitePress compiles them.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
