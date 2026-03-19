'use client';

import { getProductsByCourse, getStripeProductCheckoutSession } from '@services/payments/products';
import { ChevronDown, ChevronUp, Loader2, RefreshCcw, SquareCheck } from 'lucide-react';
import { usePlatformSession } from '@/components/Contexts/SessionContext';
import { getAbsoluteUrl } from '@services/config/config';
import { useState, useTransition } from 'react';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import useSWR from 'swr';

interface CoursePaidOptionsProps {
  course: {
    id: number;
  };
}

const CoursePaidOptions = ({ course }: CoursePaidOptionsProps) => {
  const t = useTranslations('Courses.CoursePaidOptions');
  const session = usePlatformSession() as any;
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const { data: linkedProducts, error } = useSWR(
    () => (session ? [`/payments/courses/${course.id}/products`, session.data?.tokens?.access_token] : null),
    ([_url, token]) => getProductsByCourse(course.id, token),
  );

  const handleCheckout = async (productId: number) => {
    if (!session.data?.user) {
      // Redirect to login if user is not authenticated
      router.push('/signup');
      return;
    }

    try {
      startTransition(() => setIsProcessing((prev) => ({ ...prev, [productId]: true })));
      const redirect_uri = getAbsoluteUrl('/courses');
      const response = await getStripeProductCheckoutSession(
        productId,
        redirect_uri,
        session.data?.tokens?.access_token,
      );

      if (response.success) {
        router.push(response.data.checkout_url);
      } else {
        toast.error(t('checkoutError'));
      }
    } catch {
      toast.error(t('requestError'));
    } finally {
      startTransition(() => setIsProcessing((prev) => ({ ...prev, [productId]: false })));
    }
  };

  const toggleProductExpansion = (productId: string) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  if (error) return <div>{t('failedToLoad')}</div>;
  if (!linkedProducts)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex animate-pulse items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-gray-600">
          <Loader2
            size={16}
            className="mr-2 animate-spin"
          />
          <span>{t('loading')}</span>
        </div>
      </div>
    );

  return (
    <div className="space-y-4 p-1">
      {linkedProducts.data.map((product: any) => (
        <div
          key={product.id}
          className="soft-shadow flex flex-col rounded-lg bg-slate-50/30 p-4"
        >
          <div className="mb-2 flex items-start justify-between">
            <div className="flex flex-col items-start space-y-1">
              <Badge
                className="flex w-fit items-center space-x-2 bg-gray-100/50"
                variant="outline"
              >
                {product.product_type === 'subscription' ? <RefreshCcw size={12} /> : <SquareCheck size={12} />}
                <span className="text-sm">
                  {product.product_type === 'subscription' ? t('subscription') : t('oneTimePayment')}
                  {product.product_type === 'subscription' && ` ${t('perMonth')}`}
                </span>
              </Badge>
              <h3 className="text-lg font-bold">{product.name}</h3>
            </div>
          </div>

          <div className="grow overflow-hidden">
            <div
              className={`transition-all duration-300 ease-in-out ${
                expandedProducts[product.id] ? 'max-h-[1000px]' : 'max-h-24'
              } overflow-hidden`}
            >
              <p className="text-gray-600">{product.description}</p>
              {product.benefits ? (
                <div className="mt-2">
                  <h4 className="text-sm font-semibold">{t('benefits')}</h4>
                  <p className="text-sm text-gray-600">{product.benefits}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-2">
            <button
              onClick={() => {
                toggleProductExpansion(product.id);
              }}
              className="flex items-center text-sm text-slate-500 hover:text-slate-700"
            >
              {expandedProducts[product.id] ? (
                <>
                  <ChevronUp size={16} />
                  <span>{t('showLess')}</span>
                </>
              ) : (
                <>
                  <ChevronDown size={16} />
                  <span>{t('showMore')}</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-2 flex items-center justify-between rounded-md bg-gray-100 p-2">
            <span className="text-sm text-gray-600">
              {product.price_type === 'customer_choice' ? t('minimumPrice') : t('price')}
            </span>
            <div className="flex flex-col items-end">
              <span className="text-lg font-semibold">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: product.currency,
                }).format(product.amount)}
                {product.product_type === 'subscription' && (
                  <span className="ml-1 text-sm text-gray-500">{t('perMonthSuffix')}</span>
                )}
              </span>
              {product.price_type === 'customer_choice' && (
                <span className="text-sm text-gray-500">{t('choosePrice')}</span>
              )}
            </div>
          </div>

          <Button
            className="mt-4 w-full"
            variant="default"
            onClick={() => handleCheckout(product.id)}
            disabled={isProcessing[product.id] || isPending}
          >
            {isProcessing[product.id]
              ? t('processing')
              : product.product_type === 'subscription'
                ? t('subscribeNow')
                : t('purchaseNow')}
          </Button>
        </div>
      ))}
    </div>
  );
};

export default CoursePaidOptions;
