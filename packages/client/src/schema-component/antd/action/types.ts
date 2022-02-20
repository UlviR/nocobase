import { ButtonProps, DrawerProps } from 'antd';

export type ActionProps = ButtonProps & {
  component?: any;
  useAction?: () => {
    run(): Promise<void>;
  };
};

export type ComposedAction = React.FC<ActionProps> & {
  Drawer?: ComposedActionDrawer;
  [key: string]: any;
};

export type ComposedActionDrawer = React.FC<DrawerProps & { footerNodeName?: string }> & {
  Footer?: React.FC;
};
