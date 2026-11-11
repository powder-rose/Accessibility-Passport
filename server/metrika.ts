import type { PageData } from '../src/page-data';

export function metrikaMarkup(data: PageData) {
  const id = data.content.site.metrikaId;
  if (
    data.route === 'admin' ||
    data.route === 'not-found' ||
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id))
  )
    return { head: '', body: '' };

  return {
    head: `<script type="text/javascript">
window.dataLayer = window.dataLayer || [];
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for (var j=0;j<document.scripts.length;j++) {if(document.scripts[j].src===r){return;}}
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
})(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=${id}','ym');
ym(${id},'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:'dataLayer',referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
</script>`,
    body: `<noscript><div><img src="https://mc.yandex.ru/watch/${id}" class="metrika-pixel" width="1" height="1" alt="" /></div></noscript>`,
  };
}
