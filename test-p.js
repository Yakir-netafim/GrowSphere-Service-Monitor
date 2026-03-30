const urls = Array(50).fill("https://apigateway.k8s.growsphere.netafim.com/health");
Promise.all(urls.map(url => fetch(url).then(r => r.status))).then(results => {
  const c = {}; results.forEach(r => c[r] = (c[r]||0)+1); console.log(c);
});
