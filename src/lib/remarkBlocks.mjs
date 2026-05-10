// remark plugin: converts directive AST nodes to HTML
// Requires remark-directive to run first
import { visit } from 'unist-util-visit';
import { h } from 'hastscript';

export function remarkBlocks() {
  return (tree) => {
    visit(tree, (node) => {
      if (
        node.type === 'textDirective' ||
        node.type === 'leafDirective' ||
        node.type === 'containerDirective'
      ) {
        const data = node.data || (node.data = {});
        const attrs = node.attributes || {};
        const name = node.name;

        if (name === 'index') {
          const dir = attrs.dir || 'flat';
          const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
          data.hName = 'span';
          data.hProperties = { class: `block-index ${dir}` };
          // Replace children with text
          node.children = [{
            type: 'text',
            value: `${attrs.name || ''} ${arrow} ${attrs.change || ''}`,
          }];
          return;
        }

        if (name === 'stock') {
          const dir = attrs.dir || 'flat';
          data.hName = 'div';
          data.hProperties = { class: `block-stock ${dir}` };
          node.children = [
            { type: 'html', value: `<span class="block-stock-name">${attrs.name || ''}</span><span class="block-stock-change">${attrs.change || ''}</span>` },
          ];
          return;
        }

        if (name === 'callout') {
          const type = attrs.type || 'note';
          data.hName = 'div';
          data.hProperties = { class: `block-callout ${type}` };
          return;
        }
      }
    });
  };
}
